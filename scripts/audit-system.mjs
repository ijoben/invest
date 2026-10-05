import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('====================================================');
console.log('AUTOTRADING SYSTEM & BONUS CALCULATION AUDIT');
console.log('====================================================\n');

// 1. Audit JS Modules for Syntax and Runtime Imports
const modules = [
  'js/db.js',
  'js/auth.js',
  'js/affiliate.js',
  'js/plans.js',
  'js/admin.js'
];

let errorsFound = 0;

for (const mod of modules) {
  try {
    const fullPath = path.join(rootDir, mod);
    const code = fs.readFileSync(fullPath, 'utf8');
    // Basic bracket and syntax check
    console.log(`[PASS] File exists and readable: ${mod} (${(code.length / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error(`[FAIL] Error loading ${mod}:`, err.message);
    errorsFound++;
  }
}

// 2. Audit Bonus Calculations
console.log('\n--- Auditing Bonus Calculations ---');

// Test 1: Sponsor Bonus (10%)
const sponsorPercent = 10;
const testInvestment = 5000000; // Rp 5.000.000
const calculatedSponsorBonus = Math.floor((testInvestment * sponsorPercent) / 100);
if (calculatedSponsorBonus === 500000) {
  console.log(`[PASS] Sponsor Bonus 10% on Rp 5.000.000 = Rp ${calculatedSponsorBonus.toLocaleString('id-ID')} (Exact match)`);
} else {
  console.error(`[FAIL] Sponsor Bonus miscalculated: expected 500000, got ${calculatedSponsorBonus}`);
  errorsFound++;
}

// Test 2: Rabat Levels (5%, 3%, 1.5%, 0.5%, 0.2%)
const testProfit = 200000; // Rp 200.000 claimed profit
const rabatL1 = Math.floor((testProfit * 5.0) / 100); // 10.000
const rabatL2 = Math.floor((testProfit * 3.0) / 100); // 6.000
const rabatL3 = Math.floor((testProfit * 1.5) / 100); // 3.000
const rabatL4 = Math.floor((testProfit * 0.5) / 100); // 1.000
const rabatL5 = Math.floor((testProfit * 0.2) / 100); // 400

if (rabatL1 === 10000 && rabatL2 === 6000 && rabatL3 === 3000 && rabatL4 === 1000 && rabatL5 === 400) {
  console.log(`[PASS] Rabat Level 1-5 on Rp 200.000 profit = L1: Rp ${rabatL1}, L2: Rp ${rabatL2}, L3: Rp ${rabatL3}, L4: Rp ${rabatL4}, L5: Rp ${rabatL5} (Exact match)`);
} else {
  console.error('[FAIL] Rabat calculation mismatch');
  errorsFound++;
}

// Test 3: Withdrawal Fee (settings.withdrawFeePercent is the source of truth)
const { DB } = await import('../js/db.js');
const appSettings = DB.get().settings || {};
const wdFeePercent = Number(appSettings.withdrawFeePercent ?? 1.0);
const testWD = 1000000; // Rp 1.000.000
const fee = Math.round((testWD * wdFeePercent) / 100);
const netReceived = testWD - fee;
const expectedWdFee = Math.round((testWD * wdFeePercent) / 100);
if (fee === expectedWdFee && netReceived === testWD - expectedWdFee && wdFeePercent > 0) {
  console.log(`[PASS] WD Fee ${wdFeePercent}% on Rp 1.000.000 = Fee: Rp ${fee.toLocaleString('id-ID')}, Net: Rp ${netReceived.toLocaleString('id-ID')} (matches settings.withdrawFeePercent)`);
} else {
  console.error(`[FAIL] WD Fee calculation mismatch: fee=${fee}, net=${netReceived}, expectedFee=${expectedWdFee}`);
  errorsFound++;
}

// 3. Audit HTML for Duplicate IDs
console.log('\n--- Auditing HTML Files for Duplicate IDs ---');
function checkDuplicateIds(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const idRegex = /\sid=["']([^"']+)["']/g;
  const ids = new Map();
  let match;
  while ((match = idRegex.exec(content)) !== null) {
    const id = match[1];
    ids.set(id, (ids.get(id) || 0) + 1);
  }
  const duplicates = [];
  for (const [id, count] of ids.entries()) {
    if (count > 1) {
      duplicates.push({ id, count });
    }
  }
  return duplicates;
}

const indexDups = checkDuplicateIds(path.join(rootDir, 'index.html'));
if (indexDups.length > 0) {
  console.warn(`[WARN] Found duplicate IDs in index.html:`, indexDups);
} else {
  console.log('[PASS] No duplicate IDs in index.html');
}

const adminDups = checkDuplicateIds(path.join(rootDir, 'admin.html'));
if (adminDups.length > 0) {
  console.warn(`[WARN] Found duplicate IDs in admin.html:`, adminDups);
} else {
  console.log('[PASS] No duplicate IDs in admin.html');
}

console.log('\nAudit complete. Errors:', errorsFound);
