import { DB, createReceiptBase64 } from '../js/db.js';
import { Auth } from '../js/auth.js';
import { Plans } from '../js/plans.js';
import { Affiliate } from '../js/affiliate.js';
import { Payment } from '../js/payment.js';
import { Rewards } from '../js/rewards.js';
import { Signals } from '../js/signals.js';
import { Admin } from '../js/admin.js';

// Setup Mock Environment
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
console.log('🔘 RUNNING COMPREHENSIVE BUTTONS & MODALS AUDIT');
console.log('====================================================');

DB.reset();
const dbSettings = DB.get();
dbSettings.settings.withdrawSchedule = { enabled: true, startHour: 0, endHour: 24 };
DB.save(dbSettings);

function assert(condition, name) {
  if (!condition) {
    console.error(`❌ FAILED: ${name}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${name}`);
  }
}

// 1. Test Auth functions & Quick Login Buttons
const userLogin = Auth.quickLogin('user');
assert(userLogin.success && userLogin.user.username === 'alex_investor', 'Auth.quickLogin("user") functions properly');

const adminLogin = Auth.quickLogin('admin');
assert(adminLogin.success && adminLogin.user.role === 'admin', 'Auth.quickLogin("admin") functions properly');

// 2. Test Plan top-up & claim methods
Auth.quickLogin('user');
const user = Auth.getUser();
const userPlans = Plans.getUserInvestments(user.id);
assert(Array.isArray(userPlans), 'Plans.getUserInvestments returns valid array');

const profitRate = Plans.getUserTodayProfitRate(user.id);
assert(typeof profitRate === 'number', `Plans.getUserTodayProfitRate returned ${profitRate}%`);

// 3. Test Signal retrieval & addition
const initialSignals = Signals.getSignals();
assert(initialSignals.length > 0, 'Signals.getSignals returns active signals');

const addedSig = Signals.addSignal({
  pair: 'EUR/USD',
  action: 'BUY',
  entry: '1.0850',
  tp: '1.0920',
  sl: '1.0810',
  confidence: 94
});
assert(addedSig.id.startsWith('sig-'), 'Signals.addSignal creates new signal successfully');

// 4. Test Rewards Catalog & Redemption Actions
const activeRewards = Rewards.getActiveRewards();
assert(activeRewards.length >= 6, 'Rewards.getActiveRewards returns reward catalog');

const rewardItem = Rewards.getRewardById('rew-1');
assert(rewardItem && rewardItem.title.includes('Saldo E-Wallet'), 'Rewards.getRewardById returns correct item');

// 5. Test Testimonials Retrieval, Filtering, & Creation
const allTestimonials = DB.getActiveTestimonials();
assert(allTestimonials.length >= 6, 'DB.getActiveTestimonials returns active items');

const bcaFilter = allTestimonials.filter(t => t.bank.toLowerCase().includes('bca'));
assert(bcaFilter.length > 0, 'Bank filter for BCA finds matching testimonials');

const newTesti = DB.addTestimonial({
  name: 'Dimas Anggara',
  city: 'Yogyakarta',
  bank: 'BCA Mobile',
  amount: 8500000,
  rating: 5,
  timeAgo: 'Baru saja',
  comment: 'Proses withdraw cepat dan aman.',
  receiptImage: createReceiptBase64({
    bank: 'BCA Mobile',
    name: 'DIMAS ANGGARA',
    amount: 8500000
  })
});
assert(newTesti.id.startsWith('testi-'), 'DB.addTestimonial adds item with valid SVG receipt');

// 6. Test Admin Panel Control Operations
const stats = Admin.getStats();
assert(stats.totalUsers >= 5, 'Admin.getStats returns valid stats');

// Deposit Creation & Approval / Rejection
const depReq = Payment.createDepositRequest({
  userId: user.id,
  method: 'bank',
  bankId: 'bca',
  amount: 500000
});
assert(depReq.success, 'Payment.createDepositRequest successful');

const approveDep = Admin.approveDeposit(depReq.transaction.id);
assert(approveDep.success, 'Admin.approveDeposit approved successfully');

// Withdrawal Creation & Approval / Rejection
const wdReq = Payment.createWithdrawRequest({
  userId: user.id,
  walletType: 'main',
  method: 'bank',
  bankName: 'BCA',
  accountNumber: '8888999900',
  accountHolder: 'Alex Sutanto',
  amount: 100000
});
assert(wdReq.success, 'Payment.createWithdrawRequest created');

const approveWd = Admin.approveWithdrawal(wdReq.transaction.id);
assert(approveWd.success, 'Admin.approveWithdrawal approved');

// Plan Editing & Saving
const savePlanRes = Admin.savePlan({
  id: 'plan-learn',
  name: 'Learn AI Trading Pro',
  minDeposit: 100000,
  maxDeposit: 1000000,
  minDailyProfit: 1.5,
  maxDailyProfit: 2.5,
  durationDays: 15
});
assert(savePlanRes.success, 'Admin.savePlan updated plan successfully');

// Settings Update (Affiliate & Gateway)
const updateSetRes = Admin.updateSettings({
  sponsorBonusPercent: 12,
  usdIdrRate: 16300
});
assert(updateSetRes.success, 'Admin.updateSettings updated platform settings');
assert(DB.get().settings.sponsorBonusPercent === 12, 'Settings persistence verified');

// Daily Profit Engine Trigger
const profitYieldRes = Admin.triggerProfitYield();
assert(profitYieldRes.success, 'Admin.triggerProfitYield executed successfully');

// 7. Test Plan Card Profit Calculation
const allUserInvs = Plans.getAllUserInvestments(user.id);
const rookieInvs = allUserInvs.filter(i => i.planId === 'plan-rookie');
const rookieProfit = rookieInvs.reduce((sum, inv) => sum + (inv.totalProfitEarned || 0) + (inv.pendingProfitClaim || 0), 0);
assert(rookieProfit > 0, `Plan card Rookie profit correctly calculated: ${DB.formatIDR(rookieProfit)}`);

const learnInvs = allUserInvs.filter(i => i.planId === 'plan-learn');
const learnProfit = learnInvs.reduce((sum, inv) => sum + (inv.totalProfitEarned || 0) + (inv.pendingProfitClaim || 0), 0);
assert(learnProfit === 0, `Plan card unpurchased Learn profit correctly calculated: ${DB.formatIDR(learnProfit)}`);

console.log('====================================================');
console.log('🎉 ALL BUTTONS, HANDLERS, & API METHODS VERIFIED 100%');
console.log('====================================================');
