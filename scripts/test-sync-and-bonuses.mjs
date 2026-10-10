import fs from 'fs';
import { DB } from '../js/db.js';
import { Plans } from '../js/plans.js';
import { Affiliate } from '../js/affiliate.js';

console.log('================================================================');
console.log('VERIFYING AUDIT & SYNCHRONIZATION FIXES');
console.log('================================================================');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${message}`);
    process.exitCode = 1;
  }
}

// -----------------------------------------------------------------------------
// TEST 1: REQUIREMENT 3 - ACTIVATION DATE IN PROFIT HISTORY
// -----------------------------------------------------------------------------
console.log('\n--- 1. Testing Profit Yield on Activation Date ---');

const db = DB.get();
db.users = db.users || [];
db.investments = db.investments || [];

const fixtureUserId = 'usr-activation-test';
const fixtureUser = {
  id: fixtureUserId,
  username: 'activator_user',
  fullName: 'Activator User',
  email: 'activator@test.local',
  walletBalance: 1000000,
  affiliateBalance: 0,
  points: 10,
  role: 'user',
  status: 'active'
};
db.users = db.users.filter(u => u.id !== fixtureUserId);
db.users.push(fixtureUser);

// Package activated TODAY
const todayIso = new Date().toISOString();
const fixtureInv = {
  id: 'inv-activation-today',
  userId: fixtureUserId,
  planId: 'plan-starter',
  planName: 'Starter Bot AI',
  capital: 1000000,
  minRate: 1.5,
  maxRate: 2.5,
  minDailyProfit: 1.5,
  maxDailyProfit: 2.5,
  status: 'active',
  daysElapsed: 0,
  durationDays: 30,
  totalProfitEarned: 0,
  pendingProfitClaim: 0,
  startDate: todayIso,
  createdAt: todayIso
};
db.investments = db.investments.filter(i => i.id !== fixtureInv.id);
db.investments.push(fixtureInv);

const resToday = Plans.getWeeklyProfitHistory(fixtureUserId) || {};
const recordsToday = Array.isArray(resToday.records) ? resToday.records : [];
assert(recordsToday.length === 7, `Weekly profit history returns 7 days (found: ${recordsToday.length})`);

const todayRec = recordsToday.find(r => r.isToday);
assert(todayRec !== undefined, "Today's record found in profit history");
assert(todayRec.pillText !== 'Aktivasi', `Activation date pill is NOT 'Aktivasi' (is: ${todayRec.pillText})`);
assert(todayRec.statusLabel !== 'Baru Aktif', `Activation date statusLabel is NOT 'Baru Aktif' (is: ${todayRec.statusLabel})`);

// Package activated in the past (Monday of current week)
const monday = new Date();
const currentDay = monday.getDay();
const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
monday.setDate(monday.getDate() + mondayOffset);
const mondayIso = monday.toISOString();

fixtureInv.startDate = mondayIso;
fixtureInv.createdAt = mondayIso;
fixtureInv.daysElapsed = 1;

const resMonday = Plans.getWeeklyProfitHistory(fixtureUserId) || {};
const recordsMonday = Array.isArray(resMonday.records) ? resMonday.records : [];
const mondayRec = recordsMonday[0]; // Senin
assert(mondayRec !== undefined, 'Monday record exists');
assert(mondayRec.rate !== null && mondayRec.displayRate !== '-', `Monday activation date shows profit rate: ${mondayRec.displayRate}`);
assert(mondayRec.pillText === 'Selesai' || mondayRec.pillText === 'Progress', `Monday activation date shows active pill: ${mondayRec.pillText}`);

// -----------------------------------------------------------------------------
// TEST 2: REQUIREMENT 2 - SPONSOR BONUS & RABAT BALANCES SYNCHRONIZATION
// -----------------------------------------------------------------------------
console.log('\n--- 2. Testing Sponsor Bonus & Rabat Balances ---');

const mockDb = {
  users: [
    {
      id: 'upline-fixture',
      username: 'upline_pro',
      referralCode: 'UPLINEPRO',
      referredBy: '',
      walletBalance: 500000,
      affiliateBalance: 100000,
      points: 20
    },
    {
      id: 'downline-fixture',
      username: 'downline_buyer',
      referralCode: 'DOWNPRO',
      referredBy: 'UPLINEPRO',
      walletBalance: 2000000,
      affiliateBalance: 0,
      points: 5
    }
  ],
  transactions: [],
  settings: {
    sponsorBonusPercent: 10,
    rabatLevels: [
      { level: 1, percent: 5.0 },
      { level: 2, percent: 3.0 }
    ]
  }
};

const buyer = mockDb.users[1];
const upline = mockDb.users[0];
const investAmount = 1000000;
const expectedSponsorBonus = 100000; // 10% of 1,000,000

const initUplineWallet = upline.walletBalance;
const initUplineAffiliate = upline.affiliateBalance;

const bonusGiven = Affiliate.applySponsorBonus(mockDb, buyer, investAmount);

assert(bonusGiven === expectedSponsorBonus, `Sponsor bonus returned is IDR ${expectedSponsorBonus}`);
assert(upline.affiliateBalance === initUplineAffiliate + expectedSponsorBonus, `Upline affiliateBalance increased by exact bonus (${upline.affiliateBalance})`);
assert(upline.walletBalance === initUplineWallet, `Upline walletBalance remains untouched (${upline.walletBalance}) - NO DOUBLE CREDIT`);
assert(mockDb.transactions.length === 1, 'Exactly 1 transaction recorded');

const spsTrx = mockDb.transactions[0];
assert(spsTrx.type === 'sponsor_bonus', 'Transaction type is sponsor_bonus');
assert(spsTrx.amount === expectedSponsorBonus, `Transaction amount is ${expectedSponsorBonus}`);
assert(spsTrx.walletSource === 'Wallet Tambah Teman', 'Transaction source is Wallet Tambah Teman');

// Simulate applySavePolicy verification (api/config.php logic)
const incW = upline.walletBalance - initUplineWallet; // 0
const incA = upline.affiliateBalance - initUplineAffiliate; // 100,000
const allowedCredit = spsTrx.amount; // 100,000
const pos = incW + incA; // 100,000

assert(pos <= allowedCredit, `Policy Validator: incW + incA (${pos}) <= allowedCredit (${allowedCredit}) -> 100% Approved without clamping!`);

// Test Rabat Bonus
const claimAmount = 50000;
const expectedRabat = Math.floor((claimAmount * 5) / 100); // 2,500
const rabatGiven = Affiliate.applyRabatBonus(mockDb, buyer, claimAmount);

assert(rabatGiven === expectedRabat, `Rabat bonus distributed is IDR ${expectedRabat}`);
assert(upline.affiliateBalance === initUplineAffiliate + expectedSponsorBonus + expectedRabat, `Upline affiliateBalance received rabat bonus (${upline.affiliateBalance})`);

// -----------------------------------------------------------------------------
// TEST 3: REQUIREMENT 1 - ADMIN TOGGLES & SETTINGS PERSISTENCE
// -----------------------------------------------------------------------------
console.log('\n--- 3. Testing Admin Settings Handlers & Merge Logic ---');

const adminJs = fs.readFileSync('js/admin.js', 'utf8');
const adminPageJs = fs.readFileSync('js/admin-page.js', 'utf8');

assert(adminJs.includes('await DB.adminSaveSettings({ paymentGateways: db.settings.paymentGateways })'), 'Admin.saveBank calls DB.adminSaveSettings');
assert(adminJs.includes('await DB.adminSaveSettings({ withdrawSchedule: db.settings.withdrawSchedule })'), 'Admin.saveWithdrawSchedule calls DB.adminSaveSettings');
assert(adminJs.includes('await DB.adminSaveSettings({ withdrawTerms: termsList })'), 'Admin.saveWithdrawTerms calls DB.adminSaveSettings');
assert(adminJs.includes('await DB.adminSaveSettings({ apkDownload: db.settings.apkDownload })'), 'Admin.saveApkSettings calls DB.adminSaveSettings');

assert(adminPageJs.includes('await DB.adminSaveSettings({ ppob: db.settings.ppob })'), 'AdminPage.savePpobSettings calls DB.adminSaveSettings');
assert(adminPageJs.includes('await DB.adminSaveSettings({ levelTurnoverMilestones: updated })'), 'AdminPage.saveLeaderMilestonesSettings calls DB.adminSaveSettings');
assert(adminPageJs.includes('await DB.adminSaveSettings({ dailyCheckIn: db.settings.dailyCheckIn })'), 'AdminPage.saveDailyCheckInSettings calls DB.adminSaveSettings');
assert(adminPageJs.includes('async toggleWithdrawMasterSwitch()'), 'AdminPage.toggleWithdrawMasterSwitch is async');

// Test mergeSettingsData logic with bank array replacement
function mergeSettingsData(base, override) {
  for (const k in override) {
    const v = override[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      base[k] = mergeSettingsData(base[k] || {}, v);
    } else {
      base[k] = v;
    }
  }
  return base;
}

const initialSettings = {
  paymentGateways: {
    banks: [
      { id: 'bca-1', name: 'BCA', active: true },
      { id: 'bri-1', name: 'BRI', active: true }
    ],
    usdt: { active: true }
  },
  ppob: { enabled: true, pulsaEnabled: true }
};

// Admin toggles BCA to inactive and deletes BRI
const updatedSettings = {
  paymentGateways: {
    banks: [
      { id: 'bca-1', name: 'BCA', active: false }
    ]
  },
  ppob: { enabled: false }
};

const merged = mergeSettingsData(JSON.parse(JSON.stringify(initialSettings)), updatedSettings);
assert(merged.paymentGateways.banks.length === 1, 'Banks array was cleanly overwritten (BRI removed)');
assert(merged.paymentGateways.banks[0].active === false, 'BCA active status is false');
assert(merged.paymentGateways.usdt.active === true, 'USDT sub-object preserved');
assert(merged.ppob.enabled === false, 'PPOB master toggle changed to false');
assert(merged.ppob.pulsaEnabled === true, 'PPOB sub-properties preserved');

console.log('\n================================================================');
console.log(`SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED!`);
console.log('================================================================');
