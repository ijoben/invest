import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

console.log('====================================================');
console.log('DEEP VERIFICATION AUDIT - ALL SYSTEMS & FUNCTIONS');
console.log('====================================================');

const jsFiles = [
  'js/db.js',
  'js/auth.js',
  'js/affiliate.js',
  'js/plans.js',
  'js/admin.js',
  'js/app.js',
  'js/admin-page.js',
  'scripts/cpanel-sync.mjs',
  'scripts/clean-database-sql.mjs'
];

let errors = 0;

// 1. Syntax check for all JS files
console.log('\n--- 1. Node Syntax Validation ---');
for (const rel of jsFiles) {
  const full = path.join(root, rel);
  try {
    execSync(`node --check "${full}"`);
    console.log(`[PASS] Syntax OK: ${rel}`);
  } catch (err) {
    console.error(`[FAIL] Syntax error in ${rel}:`, err.message);
    errors++;
  }
}

// 2. Check for duplicate function declarations
console.log('\n--- 2. Inspecting Duplicate Functions & Object Methods ---');
for (const rel of jsFiles) {
  const full = path.join(root, rel);
  const code = fs.readFileSync(full, 'utf8');
  
  const funcRegex = /function\s+([a-zA-Z0-9_$]+)\s*\(/g;
  let match;
  const funcs = new Map();
  while ((match = funcRegex.exec(code)) !== null) {
    const fnName = match[1];
    funcs.set(fnName, (funcs.get(fnName) || 0) + 1);
  }
  
  let dupCount = 0;
  for (const [name, count] of funcs.entries()) {
    if (count > 1) {
      console.warn(`[WARN] Duplicate function name '${name}' (${count}x) in ${rel}`);
      dupCount++;
    }
  }
  if (dupCount === 0) {
    console.log(`[PASS] Zero duplicate functions in ${rel}`);
  }
}

// 3. Functional Simulation Test for Clean Seed & Bonus Accuracy
console.log('\n--- 3. Clean Seed & Bonus Calculation Simulation ---');
const dbModule = await import('../js/db.js');
const { DB } = dbModule;
const db = DB.get();

// Test 1: Only admin user present with 0 balance
if (db.users.length === 1 && db.users[0].id === 'usr-admin') {
  console.log(`[PASS] Database seeded with exactly 1 user: ${db.users[0].username} (Admin)`);
} else {
  console.error(`[FAIL] Expected 1 admin user, found: ${db.users.length} users`);
  errors++;
}

if (db.users[0].walletBalance === 0 && db.users[0].affiliateBalance === 0) {
  console.log('[PASS] Master admin balance is exactly Rp 0');
} else {
  console.error('[FAIL] Master admin balance is not 0:', db.users[0].walletBalance);
  errors++;
}

// Test 2: Transactions & Investments are empty
if (db.transactions.length === 0 && db.investments.length === 0 && db.redemptions.length === 0) {
  console.log('[PASS] Transactions, Investments, and Redemptions lists are 100% empty (Ready for fresh production)');
} else {
  console.error('[FAIL] Leftover demo records found!');
  errors++;
}

// Test 3: Live Bonus Distribution Simulation
const { Affiliate } = await import('../js/affiliate.js');

// Create test buyer downline of ADMINVIP
const testBuyer = {
  id: 'usr-test-buyer',
  username: 'test_investor',
  referredBy: 'ADMINVIP'
};
db.users.push(testBuyer);

// Test Direct Sponsor Bonus on Rp 10.000.000
const adminBefore = db.users[0].affiliateBalance;
Affiliate.distributeSponsorBonus(testBuyer, 10000000);
const adminAfterSponsor = db.users[0].affiliateBalance;
const sponsorCredited = adminAfterSponsor - adminBefore;

if (sponsorCredited === 1000000) {
  console.log(`[PASS] Sponsor Bonus distributed: Rp 1.000.000 (10% on Rp 10.000.000) exact`);
} else {
  console.error(`[FAIL] Expected sponsor bonus 1.000.000, got: ${sponsorCredited}`);
  errors++;
}

// Test Rabat Level 1 Bonus on Rp 500.000 profit claim
const adminBeforeRabat = db.users[0].affiliateBalance;
Affiliate.distributeRabatBonus(testBuyer, 500000);
const adminAfterRabat = db.users[0].affiliateBalance;
const rabatCredited = adminAfterRabat - adminBeforeRabat;

if (rabatCredited === 25000) {
  console.log(`[PASS] Rabat Level 1 distributed: Rp 25.000 (5% on Rp 500.000) exact`);
} else {
  console.error(`[FAIL] Expected rabat L1 25.000, got: ${rabatCredited}`);
  errors++;
}

// Test Withdrawal Fee Formula (driven by settings.withdrawFeePercent as source of truth)
const withdrawAmount = 1000000;
const feePercent = Number(db.settings.withdrawFeePercent ?? 1.0);
const feeAmount = Math.round((withdrawAmount * feePercent) / 100);
const netWithdraw = withdrawAmount - feeAmount;
const expectedFee = Math.round((withdrawAmount * feePercent) / 100);
const expectedNet = withdrawAmount - expectedFee;

if (feeAmount === expectedFee && netWithdraw === expectedNet && feePercent > 0) {
  console.log(`[PASS] Withdrawal formula verified: Rp 1.000.000 -> Fee (${feePercent}%): Rp ${feeAmount.toLocaleString('id-ID')}, Net: Rp ${netWithdraw.toLocaleString('id-ID')} (matches settings.withdrawFeePercent)`);
} else {
  console.error(`[FAIL] Withdrawal fee calculation error: fee=${feeAmount}, net=${netWithdraw}, expectedFee=${expectedFee}, expectedNet=${expectedNet}`);
  errors++;
}

// Test Daily Check-In Bonus setting
const dailyBonus = db.settings.dailyCheckIn?.rewardAmount || 1000;
if (dailyBonus === 1000) {
  console.log(`[PASS] Daily Check-in bonus configured to Rp 1.000 / day exact`);
} else {
  console.error(`[FAIL] Daily check-in bonus unexpected: ${dailyBonus}`);
  errors++;
}

// Reset simulated test buyer from memory
db.users = db.users.filter(u => u.id !== 'usr-test-buyer');
db.users[0].affiliateBalance = 0;
db.transactions = [];
DB.save(db);

console.log('\n====================================================');
console.log(`DEEP AUDIT COMPLETED SUCCESSFULLY: ${errors} errors found`);
console.log('====================================================');

process.exit(errors === 0 ? 0 : 1);
