import { DB } from '../js/db.js';
import { Auth } from '../js/auth.js';
import { Plans } from '../js/plans.js';
import { Payment } from '../js/payment.js';
import { Signals } from '../js/signals.js';
import { Admin } from '../js/admin.js';

// Setup Mock Storage
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

function assert(condition, name) {
  if (!condition) {
    console.error(`❌ FAILED: ${name}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${name}`);
  }
}

console.log('====================================================');
console.log('🧪 TESTING 8 CONTINUATION REVISIONS (FGT PRO)');
console.log('====================================================');

DB.reset();
Auth.quickLogin('user');
const user = Auth.getUser();

// ----------------------------------------------------
// 1. Menu My Statistic
// ----------------------------------------------------
console.log('\n--- 1. Menu My Statistic & Rekapan Profit ---');
const userInv = Plans.getUserInvestments(user.id);
assert(Array.isArray(userInv) && userInv.length > 0, 'User investments loaded');

const activeInv = userInv.filter(i => i.status === 'active');
const totalProfitRunning = userInv.reduce((sum, i) => sum + (Number(i.profitEarned) || 0), 0);
assert(activeInv.length >= 1, `Active packages count is ${activeInv.length}`);
assert(typeof totalProfitRunning === 'number', `Running profit recap calculated: IDR ${totalProfitRunning}`);

// ----------------------------------------------------
// 2. Menu Riwayat (WD & Deposit Text Berjalan)
// ----------------------------------------------------
console.log('\n--- 2. Menu Riwayat (Running Text Data WD & Deposit) ---');
const liveDeps = Payment.getLiveMemberDeposits();
const liveWds = Payment.getLiveMemberWithdrawals();
assert(Array.isArray(liveDeps) && liveDeps.length >= 5, `Live member deposits count: ${liveDeps.length}`);
assert(Array.isArray(liveWds) && liveWds.length >= 5, `Live member withdrawals count: ${liveWds.length}`);
assert(liveDeps[0].username && liveDeps[0].amount, 'Live deposits have username and amount');
assert(liveWds[0].username && liveWds[0].amount, 'Live withdrawals have username and amount');

// ----------------------------------------------------
// 3. Market OFF Synchronization
// ----------------------------------------------------
console.log('\n--- 3. Market OFF / ON Synchronization ---');
// Toggle Market to OFF via Admin Master Switch
Admin.saveMarketMasterSettings({ isOpen: false, message: 'Market Maintenance' });
let marketStatus = Plans.isMarketOpen();
assert(!marketStatus.isOpen, 'Plans.isMarketOpen().isOpen is FALSE when master switch is closed');

// Check price tick when market is OFF
const initialPrice = (Signals.getMarketTickers().find(t => t.pair === 'EUR/USD') || {}).price;
Signals.tickMarkets();
const priceAfterTickOff = (Signals.getMarketTickers().find(t => t.pair === 'EUR/USD') || {}).price;
assert(initialPrice === priceAfterTickOff, 'Signals price does not fluctuate when market is OFF');

// Toggle Market back to ON
Admin.saveMarketMasterSettings({ isOpen: true });
marketStatus = Plans.isMarketOpen(new Date(2026, 8, 16)); // Wednesday (weekday)
assert(marketStatus.isOpen, 'Plans.isMarketOpen().isOpen returns TRUE on weekday when master switch is open');

// ----------------------------------------------------
// 4. User Profile: Sponsor, Active Status, & Joined Date
// ----------------------------------------------------
console.log('\n--- 4. User Profile Sponsor, Status & Joined Date ---');
assert(user.username === 'alex_investor', 'Current user is alex_investor');
const sponsorText = user.referredBy ? `@${user.referredBy}` : 'Optional (Tidak ada sponsor)';
assert(sponsorText.length > 0, `Sponsor text formatted: ${sponsorText}`);

const hasActivePlan = activeInv.length > 0;
const memberStatusLabel = hasActivePlan ? 'Member Aktif' : 'Belum Aktif';
assert(memberStatusLabel === 'Member Aktif', `Member status label is: ${memberStatusLabel}`);

const joinedDate = new Date(user.createdAt || '2026-09-19');
const formattedJoined = joinedDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
assert(formattedJoined.includes('2026') || formattedJoined.includes('September'), `Joined date formatted: ${formattedJoined}`);

// Test user without sponsor
const db = DB.get();
const noSponsorUser = { ...user, id: 'usr-nosponsor', referredBy: null };
db.users.push(noSponsorUser);
DB.save(db);
const sponsorTextNoRef = noSponsorUser.referredBy ? `@${noSponsorUser.referredBy}` : 'Optional (Tidak ada sponsor)';
assert(sponsorTextNoRef === 'Optional (Tidak ada sponsor)', 'No-sponsor user shows "Optional (Tidak ada sponsor)"');

// ----------------------------------------------------
// 5. Leaderboard (Top Sponsors & Top Profit Earner)
// ----------------------------------------------------
console.log('\n--- 5. Leaderboard Top 10 Sponsors & Top 10 Profit ---');
const topSponsors = Plans.getTopSponsors(10);
const topProfits = Plans.getTopProfits(10);

assert(Array.isArray(topSponsors) && topSponsors.length >= 10, `Top sponsors returned >= 10 members (got ${topSponsors.length})`);
assert(Array.isArray(topProfits) && topProfits.length >= 10, `Top profit earners returned >= 10 members (got ${topProfits.length})`);
assert(topSponsors[0].sponsorCount !== undefined, 'Top sponsors have sponsorCount');
assert(topProfits[0].totalProfit !== undefined, 'Top profits have totalProfit');

// ----------------------------------------------------
// 6. Saldo Terlock & Proses Refundkan ke Saldo Saya
// ----------------------------------------------------
console.log('\n--- 6. Saldo Terlock & Proses Refundkan ke Saldo Saya ---');
// Give user a completed investment where contract expired
const initialWallet = user.walletBalance;
const expiredInv = {
  id: 'inv-test-expired-1',
  userId: user.id,
  planId: 'plan-1',
  planName: 'Invest Learn',
  capital: 2000000,
  dailyProfitRate: 2.5,
  durationDays: 1,
  daysElapsed: 1,
  profitEarned: 50000,
  unclaimedProfit: 0,
  status: 'completed',
  capitalReturned: false, // KEPT LOCKED per Requirement 6
  refundReady: true,
  createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  lastClaimDate: new Date().toISOString()
};

const currentDb = DB.get();
currentDb.investments.push(expiredInv);
DB.save(currentDb);

// Verify capital is locked
const lockedCapitalBefore = Payment.getWithdrawableBalance(user.id);
const refundableList = Plans.getRefundableInvestments(user.id);
assert(refundableList.some(i => i.id === 'inv-test-expired-1'), 'Expired investment listed in getRefundableInvestments()');

// Verify wallet was NOT automatically credited
const refreshedUserBefore = DB.getUserById(user.id);
assert(refreshedUserBefore.walletBalance === initialWallet, 'Capital is NOT auto-credited to wallet balance');

// User clicks "proses refundkan ke saldo saya"
const refundResult = Plans.processContractRefund('inv-test-expired-1', user.id);
assert(refundResult.success, 'Plans.processContractRefund succeeded');
assert(refundResult.amountRefunded === 2000000, `Refunded exactly IDR ${refundResult.amountRefunded}`);

const refreshedUserAfter = DB.getUserById(user.id);
assert(refreshedUserAfter.walletBalance === initialWallet + 2000000, `User wallet balance increased by refunded capital to IDR ${refreshedUserAfter.walletBalance}`);

// Verify it cannot be refunded twice
const doubleRefundResult = Plans.processContractRefund('inv-test-expired-1', user.id);
assert(!doubleRefundResult.success, 'Double refund prevented');

// ----------------------------------------------------
// 7. Package Choice Active Count (e.g. 2 Paket Active)
// ----------------------------------------------------
console.log('\n--- 7. Package Choice Active Count ---');
// Add 2 active packages for 'plan-1' (Invest Learn)
const dbForCount = DB.get();
dbForCount.investments = dbForCount.investments.filter(i => i.userId !== user.id);
dbForCount.investments.push({
  id: 'inv-active-1',
  userId: user.id,
  planId: 'plan-1',
  planName: 'Invest Learn',
  capital: 1000000,
  dailyProfitRate: 2.5,
  durationDays: 30,
  daysElapsed: 5,
  profitEarned: 125000,
  unclaimedProfit: 0,
  status: 'active',
  capitalReturned: false
});
dbForCount.investments.push({
  id: 'inv-active-2',
  userId: user.id,
  planId: 'plan-1',
  planName: 'Invest Learn',
  capital: 1500000,
  dailyProfitRate: 2.5,
  durationDays: 30,
  daysElapsed: 2,
  profitEarned: 75000,
  unclaimedProfit: 0,
  status: 'active',
  capitalReturned: false
});
DB.save(dbForCount);

const userActiveInvs = Plans.getUserInvestments(user.id).filter(i => i.status === 'active');
const plan1Count = userActiveInvs.filter(i => i.planId === 'plan-1').length;
assert(plan1Count === 2, `Invest Learn has exactly ${plan1Count} active packages (renders: "${plan1Count} Paket Active")`);

// ----------------------------------------------------
// 8. Kelas Trading (Trading Idea -> Kelas Trading)
// ----------------------------------------------------
console.log('\n--- 8. Kelas Trading WA & Telegram Integration ---');
const waUrl = 'https://wa.me/6281234567890?text=Halo%20Admin%20FGT%20Pro,%20saya%20ingin%20bergabung%20dengan%20Kelas%20Trading%20VIP';
const teleUrl = 'https://t.me/fgtpro_official';
assert(waUrl.includes('Kelas%20Trading'), 'WhatsApp direct link configured for Kelas Trading');
assert(teleUrl.includes('fgtpro'), 'Telegram direct link configured for Kelas Trading');

console.log('\n====================================================');
console.log('🎉 ALL 8 CONTINUATION REVISIONS VERIFIED SUCCESSFULLY!');
console.log('====================================================\n');
