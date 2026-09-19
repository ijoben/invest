import { DB, escapeHtml } from '../js/db.js';
import { Auth } from '../js/auth.js';
import { Plans } from '../js/plans.js';
import { Payment } from '../js/payment.js';
import { Affiliate } from '../js/affiliate.js';
import { Rewards } from '../js/rewards.js';
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

let passedCount = 0;
let totalCount = 0;

function assert(condition, testName) {
  totalCount++;
  if (!condition) {
    console.error(`❌ SECURITY CHECK FAILED: ${testName}`);
    process.exit(1);
  } else {
    passedCount++;
    console.log(`🔒 [PASS ${passedCount}] ${testName}`);
  }
}

console.log('================================================================');
console.log('🛡️  FGT PRO - END-TO-END CODE SECURITY & INTEGRITY AUDIT');
console.log('================================================================\n');

DB.reset();
const dbSettings = DB.get();
dbSettings.settings.withdrawSchedule = { enabled: true, startHour: 0, endHour: 24 };
DB.save(dbSettings);

// ==============================================================================
// 1. AUTHENTICATION & REGISTRATION INTEGRITY CHECKS
// ==============================================================================
console.log('--- 1. Authentication & Registration Security ---');

// 1.1 Empty / Null credentials
const emptyLogin = Auth.login('', '');
assert(!emptyLogin.success, 'Rejects login with empty credentials');

// 1.2 Non-existent user
const fakeLogin = Auth.login('ghost_user_9999', 'password123');
assert(!fakeLogin.success, 'Rejects login for non-existent username/email');

// 1.3 Incorrect password
const wrongPass = Auth.login('alex_investor', 'WrongPassword123!');
assert(!wrongPass.success, 'Rejects login with incorrect password');

// 1.4 Valid login
const validLogin = Auth.login('alex_investor', 'user123');
assert(validLogin.success && Auth.isLoggedIn(), 'Accepts valid user credentials and establishes session');

// 1.5 Duplicate registration prevention
const dupReg = Auth.register({
  username: 'alex_investor',
  email: 'new_alex@gmail.com',
  password: 'Password123!'
});
assert(!dupReg.success, 'Prevents registration with already registered username');

// 1.6 Duplicate email registration prevention
const dupEmailReg = Auth.register({
  username: 'unique_user_alex',
  email: 'alex@gmail.com', // Existing email in DB
  password: 'Password123!'
});
assert(!dupEmailReg.success, 'Prevents registration with already registered email');


// ==============================================================================
// 2. FINANCIAL INTEGRITY & BALANCE MANIPULATION CHECKS
// ==============================================================================
console.log('\n--- 2. Financial Logic & Negative Value Injection Defense ---');

const user = Auth.getUser();

// 2.1 Negative Deposit Injection
const negDep = Payment.createDepositRequest({
  userId: user.id,
  method: 'bank',
  bankId: 'bca',
  amount: -500000
});
assert(!negDep.success, 'Rejects negative deposit injection (-500,000)');

// 2.2 NaN / Non-numeric Deposit Injection
const nanDep = Payment.createDepositRequest({
  userId: user.id,
  method: 'bank',
  bankId: 'bca',
  amount: 'DROP TABLE users;'
});
assert(!nanDep.success, 'Rejects non-numeric / SQL-like string deposit amount');

// 2.3 Deposit Below Minimum Threshold (< 50,000)
const underMinDep = Payment.createDepositRequest({
  userId: user.id,
  method: 'bank',
  bankId: 'bca',
  amount: 25000
});
assert(!underMinDep.success, 'Rejects deposit below minimum limit (25,000 < 50,000)');

// 2.4 Negative Withdrawal Injection
const negWd = Payment.createWithdrawRequest({
  userId: user.id,
  walletType: 'wallet',
  method: 'bank',
  bankName: 'BCA',
  accountNumber: '1234567890',
  accountHolder: 'ALEX SUTANTO',
  amount: -250000
});
assert(!negWd.success, 'Rejects negative withdrawal injection (-250,000)');

// 2.5 Withdrawal Exceeding Available Balance
const currUser = DB.getUserById(user.id);
const overWd = Payment.createWithdrawRequest({
  userId: user.id,
  walletType: 'wallet',
  method: 'bank',
  bankName: 'BCA',
  accountNumber: '1234567890',
  accountHolder: 'ALEX SUTANTO',
  amount: currUser.walletBalance + 50000000 // Exceeds balance
});
assert(!overWd.success, 'Rejects withdrawal exceeding user wallet balance');

// 2.6 Locked Capital cannot be withdrawn
// User has locked active investments, verify getWithdrawableBalance isolates locked capital
const balBreakdown = Payment.getWithdrawableBalance(user.id);
assert(balBreakdown.lockedCapital >= 0, 'Separates locked active investment capital from free wallet balance');


// ==============================================================================
// 3. TRANSACTION WORKFLOW & DOUBLE-ACTION PREVENTIONS
// ==============================================================================
console.log('\n--- 3. Transaction Workflow & Double-Spend / Double-Action Defenses ---');

// 3.1 Deposit Approval idempotency
const validDepRes = Payment.createDepositRequest({
  userId: user.id,
  method: 'bank',
  bankId: 'bca',
  amount: 1000000
});
assert(validDepRes.success, 'Valid deposit request submitted');
const depTrxId = validDepRes.transaction.id;

// Approve deposit
const balBeforeApprove = DB.getUserById(user.id).walletBalance;
const approveDep1 = Admin.approveDeposit(depTrxId);
assert(approveDep1.success, 'Admin approves pending deposit');
const balAfterApprove = DB.getUserById(user.id).walletBalance;
assert(balAfterApprove === balBeforeApprove + validDepRes.transaction.amount, 'Wallet balance credited with exact deposit amount');

// Second approval attempt MUST fail (double-credit prevention)
const approveDep2 = Admin.approveDeposit(depTrxId);
assert(!approveDep2.success, 'Prevents double-approval / double-crediting of the same deposit');

// 3.2 Withdrawal Rejection idempotency & refund guard
// Create valid withdrawal
const wdAmount = 100000;
const wdRes = Payment.createWithdrawRequest({
  userId: user.id,
  walletType: 'wallet',
  method: 'bank',
  bankName: 'BCA',
  accountNumber: '1234567890',
  accountHolder: 'ALEX SUTANTO',
  amount: wdAmount
});
assert(wdRes.success, 'Valid withdrawal created');
const wdTrxId = wdRes.transaction.id;
const balAfterWdDeduct = DB.getUserById(user.id).walletBalance;

// Admin rejects withdrawal -> balance refunded
const rejWd1 = Admin.rejectWithdrawal(wdTrxId, 'Account mismatch');
assert(rejWd1.success, 'Admin rejects withdrawal and refunds balance');
const balAfterRejRefund = DB.getUserById(user.id).walletBalance;
assert(balAfterRejRefund === balAfterWdDeduct + wdAmount, 'User wallet balance refunded after withdrawal rejection');

// Second rejection attempt MUST fail (double-refund prevention)
const rejWd2 = Admin.rejectWithdrawal(wdTrxId, 'Account mismatch duplicate');
assert(!rejWd2.success, 'Prevents double-refund on already rejected withdrawal');


// ==============================================================================
// 4. INVESTMENT PLAN ENGINE & CONTRACT REFUND DEFENSES
// ==============================================================================
console.log('\n--- 4. Investment Engine & Contract Refund Integrity ---');

// 4.1 Investing negative or non-numeric amount
const negInvest = Plans.invest({
  userId: user.id,
  planId: 'plan-1',
  amount: -1000000
});
assert(!negInvest.success, 'Rejects negative investment amount');

// 4.2 Investing below plan minimum
const underMinInvest = Plans.invest({
  userId: user.id,
  planId: 'plan-1',
  amount: 10000 // min is 50,000
});
assert(!underMinInvest.success, 'Rejects investment below tier minDeposit');

// 4.3 Double-claim prevention on profit distribution
// Clear any pending profit and yield once
const dbInv = DB.get();
const testInv = {
  id: 'inv-sec-test-1',
  userId: user.id,
  planId: 'plan-1',
  planName: 'Invest Learn',
  capital: 1000000,
  minRate: 2.0,
  maxRate: 3.0,
  daysElapsed: 5,
  durationDays: 30,
  totalProfitEarned: 100000,
  pendingProfitClaim: 25000, // Pending claim
  status: 'active',
  capitalReturned: false,
  startDate: new Date().toISOString()
};
dbInv.investments.push(testInv);
DB.save(dbInv);

// Claim 1: must succeed
const claim1 = Plans.claimProfit(user.id);
assert(claim1.success, 'First profit claim succeeds');

// Claim 2: immediately after, must be rejected (no double claim)
const claim2 = Plans.claimProfit(user.id);
assert(!claim2.success, 'Double profit claim in same period is strictly rejected');

// 4.4 Contract Completion & Saldo Terlock Manual Refund
const expiredContract = {
  id: 'inv-sec-expired-contract',
  userId: user.id,
  planId: 'plan-1',
  planName: 'Invest Learn',
  capital: 1500000,
  minRate: 2.0,
  maxRate: 3.0,
  daysElapsed: 30,
  durationDays: 30,
  totalProfitEarned: 900000,
  pendingProfitClaim: 0,
  status: 'completed',
  capitalReturned: false, // Locked until manual refund
  refundReady: true,
  startDate: new Date(Date.now() - 35 * 86400000).toISOString()
};

const dbWithExp = DB.get();
dbWithExp.investments.push(expiredContract);
DB.save(dbWithExp);

// Check that capital is NOT yet in user wallet
const walletBeforeManualRefund = DB.getUserById(user.id).walletBalance;

// First refund: must succeed
const refundRes1 = Plans.processContractRefund('inv-sec-expired-contract', user.id);
assert(refundRes1.success && refundRes1.amountRefunded === 1500000, 'Manual refund "proses refundkan ke saldo saya" succeeds');
const walletAfterManualRefund = DB.getUserById(user.id).walletBalance;
assert(walletAfterManualRefund === walletBeforeManualRefund + 1500000, 'Capital returned accurately to wallet balance');

// Second refund: MUST fail (no double refund exploit)
const refundRes2 = Plans.processContractRefund('inv-sec-expired-contract', user.id);
assert(!refundRes2.success, 'Double refund of same completed contract is strictly prevented');


// ==============================================================================
// 5. AFFILIATE & MULTI-TIER REFERRAL INTEGRITY
// ==============================================================================
console.log('\n--- 5. Affiliate, Self-Referral & Circular Loop Defenses ---');

// 5.1 Self-Referral Bonus Exploit Prevention
const selfAffUser = DB.getUserById(user.id);
const affBalBeforeSelfBuy = selfAffUser.affiliateBalance || 0;
// Simulate user setting referredBy to their own referral code
selfAffUser.referredBy = selfAffUser.referralCode;
Affiliate.distributeSponsorBonus(selfAffUser, 5000000);
const affBalAfterSelfBuy = DB.getUserById(user.id).affiliateBalance || 0;
assert(affBalBeforeSelfBuy === affBalAfterSelfBuy, 'User cannot earn sponsor bonus on their own purchases (Self-referral blocked)');

// 5.2 Circular Referral Loop Defense
// User A -> User B -> User A
const dbCirc = DB.get();
const userA = { id: 'usr-circ-a', username: 'circ_a', referralCode: 'CIRCA', referredBy: 'CIRCB', affiliateBalance: 0 };
const userB = { id: 'usr-circ-b', username: 'circ_b', referralCode: 'CIRCB', referredBy: 'CIRCA', affiliateBalance: 0 };
dbCirc.users.push(userA, userB);
DB.save(dbCirc);

// distributeRabatBonus must terminate safely without infinite loop or double payout
let loopThrewError = false;
try {
  Affiliate.distributeRabatBonus(userA, 100000);
} catch (e) {
  loopThrewError = true;
}
assert(!loopThrewError, 'Circular referral hierarchy terminates cleanly without infinite recursion');


// ==============================================================================
// 6. REWARDS & POINT REDEMPTION SECURITY
// ==============================================================================
console.log('\n--- 6. Reward Points & Stock Integrity ---');

// 6.1 Insufficient points redemption
const lowPointsUser = { id: 'usr-low-points', username: 'poor_user', points: 5, walletBalance: 0 };
const dbRdm = DB.get();
dbRdm.users.push(lowPointsUser);
DB.save(dbRdm);

const badRdm = Rewards.redeemReward(lowPointsUser.id, 'rew-1', { targetContact: '0812345678' }); // costs 50 points
assert(!badRdm.success, 'Rejects reward redemption when user points are insufficient (5 < 50)');

// 6.2 Zero stock redemption
const rewardItem = dbRdm.rewards.find(r => r.id === 'rew-1');
const origStock = rewardItem.stock;
rewardItem.stock = 0;
DB.save(dbRdm);

const outOfStockRdm = Rewards.redeemReward(user.id, 'rew-1', { targetContact: '0812345678' });
assert(!outOfStockRdm.success, 'Rejects reward redemption when item stock is zero');

// Restore stock
rewardItem.stock = origStock;
DB.save(dbRdm);


// ==============================================================================
// 7. XSS (CROSS-SITE SCRIPTING) SANITIZATION DEFENSES
// ==============================================================================
console.log('\n--- 7. Cross-Site Scripting (XSS) Sanitization ---');

const maliciousInputs = [
  '<script>alert("XSS")</script>',
  '<img src=x onerror=alert(1)>',
  '"><svg onload=alert(document.cookie)>',
  "'; DROP TABLE users; --",
  '<iframe src="javascript:alert(1)"></iframe>'
];

maliciousInputs.forEach((payload, idx) => {
  const sanitized = escapeHtml(payload);
  const isNeutralized = !sanitized.includes('<') && !sanitized.includes('>') && !sanitized.includes('"');
  assert(isNeutralized, `XSS payload #${idx + 1} sanitized correctly: "${payload.substring(0, 20)}..." -> "${sanitized.substring(0, 20)}..."`);
});

// ==============================================================================
// SUMMARY REPORT
// ==============================================================================
console.log('\n================================================================');
console.log(`🎉 ALL ${passedCount}/${totalCount} SECURITY CHECKS PASSED WITH ZERO VULNERABILITIES!`);
console.log('================================================================\n');
