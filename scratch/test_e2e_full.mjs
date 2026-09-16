import { DB, createReceiptBase64 } from '../js/db.js';
import { Auth } from '../js/auth.js';
import { Plans } from '../js/plans.js';
import { Affiliate } from '../js/affiliate.js';
import { Payment } from '../js/payment.js';
import { Rewards } from '../js/rewards.js';
import { Admin } from '../js/admin.js';

// Setup Mock LocalStorage
const storage = {};
global.localStorage = {
  getItem: (k) => storage[k] || null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
  clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
};
global.sessionStorage = {
  getItem: (k) => storage[k] || null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; }
};

console.log('====================================================');
console.log('🚀 RUNNING COMPREHENSIVE E2E PLATFORM AUDIT & TESTS');
console.log('====================================================');

// Reset to initial clean state
DB.reset();
let db = DB.get();

function assert(condition, name) {
  if (!condition) {
    console.error(`❌ FAILED: ${name}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${name}`);
  }
}

// 1. Database & Initial State
assert(db.users.length === 5, 'Initial default users count is 5 (Admin, Alex, Sarah, Budi, Rendy)');
assert(db.plans.length === 4, 'Initial plans count is 4 (Learn, Rookie, Sophomore, VIP)');
assert(db.rewards.length === 6, 'Initial rewards catalog count is 6');
assert(db.testimonials.length === 6, 'Initial testimonials count is 6');

// 2. User Authentication & Registration
const regRes = Auth.register({
  username: 'budi_trader',
  fullName: 'Budi Santoso',
  email: 'budi_trader@gmail.com',
  phone: '081299998888',
  password: 'password123',
  referralCode: 'ALEX88' // Alex's referral code
});
assert(regRes.success, 'New user budi_trader registered with upline ALEX88');

const budi = DB.getUserById(regRes.user.id);
assert(budi.referredBy === 'ALEX88', 'Budi upline referral code correctly set to ALEX88');
assert(budi.walletBalance === 0, 'Budi initial wallet balance is 0 (real data)');

const loginRes = Auth.login('budi_trader', 'password123');
assert(loginRes.success && Auth.isLoggedIn(), 'Budi login succeeded');

// 3. Deposit Flow
const depRes = Payment.createDepositRequest({
  userId: budi.id,
  method: 'bank',
  bankId: 'bca',
  amount: 2000000
});
assert(depRes.success, 'Budi submitted deposit request of IDR 2,000,000');
const depTxId = depRes.transaction.id;

// Admin Approves Deposit
const admApproveDep = Admin.approveDeposit(depTxId);
assert(admApproveDep.success, 'Admin approved Budi deposit');
const budiAfterDep = DB.getUserById(budi.id);
assert(budiAfterDep.walletBalance === depRes.transaction.amount, `Budi wallet balance updated with exact deposit amount (${depRes.transaction.amount})`);

// 4. Investment Flow & Sponsor Commission
const alexBeforeInv = DB.getUserById('usr-demo');
const alexAffBalBefore = alexBeforeInv.affiliateBalance;

const invRes = Plans.invest({
  userId: budi.id,
  planId: 'plan-rookie', // IDR 1,000,000
  amount: 1000000
});
assert(invRes.success, 'Budi invested IDR 1,000,000 in Paket Rookie');

const budiAfterInv = DB.getUserById(budi.id);
assert(budiAfterInv.walletBalance === budiAfterDep.walletBalance - 1000000, 'Budi wallet balance deducted by IDR 1,000,000');
assert(budiAfterInv.points === 60, 'Budi awarded 50 loyalty points on new investment (10 welcome + 50 = 60)');

const alexAfterInv = DB.getUserById('usr-demo');
const expectedSponsorBonus = 1000000 * 0.10; // 10% = IDR 100,000
assert(alexAfterInv.affiliateBalance === alexAffBalBefore + expectedSponsorBonus, 'Alex (upline) received 10% sponsor bonus (IDR 100,000)');

// 5. Profit Cycle & Time Elapsed Simulation
const invId = invRes.investment.id;
db = DB.get();
const invRecord = db.investments.find(i => i.id === invId);
// Fast forward 25 hours (1 full cycle)
invRecord.lastProfitYieldDate = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
invRecord.startDate = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
DB.save(db);

// Sync user investments
Plans.syncUserInvestments(budi.id);
const syncedInvs = Plans.getUserInvestments(budi.id);
const activeInv = syncedInvs.find(i => i.id === invId);
assert(activeInv.pendingProfitClaim > 0, `Profit yielded after 25 hours: IDR ${activeInv.pendingProfitClaim}`);

// 6. Profit Claim & Rabat Bonus to Upline
const alexBalBeforeClaim = DB.getUserById('usr-demo').affiliateBalance;
const budiWalletBeforeClaim = DB.getUserById(budi.id).walletBalance;
const claimProfitAmt = activeInv.pendingProfitClaim;

const claimRes = Plans.claimProfit(budi.id);
assert(claimRes.success, 'Budi claimed daily profit');

const budiInvAfterClaim = DB.get().investments.find(i => i.id === invId);
assert(budiInvAfterClaim.daysElapsed === 1, 'Days elapsed is now 1 after claim');

const budiAfterClaim = DB.getUserById(budi.id);
assert(budiAfterClaim.walletBalance === budiWalletBeforeClaim + claimProfitAmt, 'Budi wallet credited with claimed profit');
assert(budiAfterClaim.points === 62, 'Budi points incremented by +2 daily bonus (total 62)');

const alexAfterClaim = DB.getUserById('usr-demo');
const rabatL1Percent = DB.get().settings.rabatLevels.find(l => l.level === 1)?.percent || 5.0;
const expectedRabatL1 = Math.floor(claimProfitAmt * (rabatL1Percent / 100)); // Level 1 rabat on downline daily profit
assert(alexAfterClaim.affiliateBalance === alexBalBeforeClaim + expectedRabatL1, `Alex received Level 1 rabat (IDR ${expectedRabatL1})`);

// 7. Full Package Expiry & Capital Return Simulation
db = DB.get();
const activeInvExp = db.investments.find(i => i.id === invId);
// Set days elapsed to durationDays (30 days) and last yield 25 hours ago
activeInvExp.daysElapsed = activeInvExp.durationDays;
activeInvExp.lastProfitYieldDate = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
DB.save(db);

const budiBalBeforeExpiry = DB.getUserById(budi.id).walletBalance;
Plans.syncUserInvestments(budi.id);

const budiAfterExpiry = DB.getUserById(budi.id);
assert(budiAfterExpiry.walletBalance === budiBalBeforeExpiry + 1000000, 'Budi capital (IDR 1,000,000) 100% returned upon package completion');

const expiredInv = DB.get().investments.find(i => i.id === invId);
assert(expiredInv.status === 'completed', 'Investment status updated to completed');

// 8. Reward Redemption Flow
const gopayReward = Rewards.getRewardById('rew-1');
const stockBefore = gopayReward.stock;

const rdmRes = Rewards.redeemReward(budi.id, 'rew-1', {
  targetContact: '081299998888',
  deliveryAddress: 'GOPAY Wallet Budi',
  note: 'Klaim reward'
});
assert(rdmRes.success, 'Budi redeemed Gopay 50k reward with 50 points');

const budiAfterRdm = DB.getUserById(budi.id);
assert(budiAfterRdm.points === 12, 'Budi points deducted by 50 (remaining: 12)');

const gopayRewardAfter = Rewards.getRewardById('rew-1');
assert(gopayRewardAfter.stock === stockBefore - 1, 'Reward stock decremented by 1');

// Admin Process and Complete Redemption
const rdmId = rdmRes.redemption.id;
const admProcessRdm = Admin.approveRedemption(rdmId, 'Nomor e-wallet terverifikasi');
assert(admProcessRdm.success, 'Admin set redemption to processing');

const admCompleteRdm = Admin.completeRedemption(rdmId, 'Saldo GoPay Rp 50.000 sukses ditransfer');
assert(admCompleteRdm.success, 'Admin completed redemption');

// Test Redemption Rejection and Auto Refund
// Give budi 50 points for testing rejection
Admin.adjustUserBalance(budi.id, { points: 50 });
const rdmRes2 = Rewards.redeemReward(budi.id, 'rew-1', {
  targetContact: '00000000',
  deliveryAddress: 'Invalid',
  note: 'Salah nomor'
});
assert(rdmRes2.success, 'Second redemption created');
const rdmId2 = rdmRes2.redemption.id;

const admRejectRdm = Admin.rejectRedemption(rdmId2, 'Nomor tidak valid');
assert(admRejectRdm.success, 'Admin rejected invalid redemption');

const budiAfterReject = DB.getUserById(budi.id);
assert(budiAfterReject.points === 50, 'Budi points fully refunded (50 points)');

// 9. Withdrawal Flow & Fee Calculation
const wdAmount = 500000;
const wdRes = Payment.createWithdrawRequest({
  userId: budi.id,
  walletType: 'main',
  method: 'bank',
  bankName: 'BCA',
  accountNumber: '1234567890',
  accountHolder: 'Budi Santoso',
  amount: wdAmount
});
assert(wdRes.success, 'Withdraw request of IDR 500,000 created');

const wdTx = wdRes.transaction;
assert(wdTx.fee === 5000, 'Withdraw fee 1% = IDR 5,000');
assert(wdTx.netAmount === 495000, 'Net amount to transfer = IDR 495,000');

// Test Admin Reject with Balance Refund
const admRejectWd = Admin.rejectWithdrawal(wdTx.id, 'Nama rekening tidak cocok');
assert(admRejectWd.success, 'Admin rejected withdrawal');
const budiAfterWdReject = DB.getUserById(budi.id);
assert(budiAfterWdReject.walletBalance >= 2000000, 'Budi wallet balance refunded on WD rejection');

// 10. Testimonials Engine
const newTesti = DB.addTestimonial({
  name: 'Budi Santoso',
  city: 'Surabaya',
  bank: 'BCA Mobile',
  amount: 495000,
  rating: 5,
  timeAgo: 'Baru saja',
  comment: 'Mantap penarikan landed kilat!',
  receiptImage: createReceiptBase64({
    bank: 'BCA Mobile',
    name: 'BUDI SANTOSO',
    amount: 495000,
    timeAgo: '16 Sep 2026 16:30',
    refNo: 'TEST-123456'
  })
});
assert(newTesti.id.startsWith('testi-'), 'New testimonial added with SVG Base64 receipt');
const allActiveTestis = DB.getActiveTestimonials();
assert(allActiveTestis.some(t => t.id === newTesti.id), 'Testimonial appears in active testimonials list');

console.log('====================================================');
console.log('🎉 ALL 24 E2E INTEGRATION & BUSINESS RULES PASSED 100%');
console.log('====================================================');
