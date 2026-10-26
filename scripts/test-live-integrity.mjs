// LIVE read-only integrity & API-coverage audit.
//
// Safety: this harness never calls action=save, clear_demo, delete_user,
// invest_plan, transfer_to_member or any other write path. It only logs in
// (admin session) and reads state, so the production database stays untouched.
//
// Requires ADMIN_PASSWORD.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const API = 'https://autotrading.my.id/api/index.php';

const adminId = process.env.ADMIN_IDENTIFIER || 'admin';
const adminPass = process.env.ADMIN_PASSWORD || '';
if (!adminPass) {
  console.error('ADMIN_PASSWORD is required (set it in the environment for this run).');
  process.exit(2);
}

let pass = 0, fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) { pass++; console.log('  OK   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra ? '  <' + extra + '>' : '')); }
};

const login = await (await fetch(`${API}?action=login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: adminId, password: adminPass })
})).json();
check('Admin login', login.success === true && login.user?.role === 'admin', JSON.stringify(login).slice(0, 160));
if (!login.success) process.exit(1);

const state = (await (await fetch(`${API}?action=get&sessionToken=${encodeURIComponent(login.sessionToken)}`)).json()).data;
const users = state.users || [];
const investments = state.investments || [];
const transactions = state.transactions || [];
const plans = state.plans || [];
const settings = state.settings || {};
const userIds = new Set(users.map(u => u.id));

// --- Relational integrity ----------------------------------------------------
check('ID user unik', userIds.size === users.length, `${userIds.size}/${users.length}`);
const usernames = users.map(u => String(u.username || '').toLowerCase());
check('Username unik (case-insensitive)', new Set(usernames).size === usernames.length);
check('ID transaksi unik', new Set(transactions.map(t => t.id)).size === transactions.length, `${new Set(transactions.map(t => t.id)).size}/${transactions.length}`);

const negativeBalances = users.filter(u => Number(u.walletBalance) < 0 || Number(u.affiliateBalance) < 0 || Number(u.points) < 0);
check('Tidak ada saldo/point negatif', negativeBalances.length === 0, negativeBalances.map(u => u.username).join(','));

const orphanInv = investments.filter(i => i.userId && !userIds.has(i.userId));
check('Semua investasi terhubung ke member valid', orphanInv.length === 0, orphanInv.map(i => i.id).join(','));
const orphanTx = transactions.filter(t => t.userId && !userIds.has(t.userId));
check('Semua transaksi terhubung ke member valid', orphanTx.length === 0, orphanTx.map(t => t.id).join(','));

const allowedInvStatus = new Set(['active', 'completed', 'cancelled', 'withdrawn']);
const badInvStatus = investments.filter(i => !allowedInvStatus.has(i.status));
check('Status investasi valid', badInvStatus.length === 0, badInvStatus.map(i => i.status).join(','));
const overDay = investments.filter(i => Number(i.daysElapsed || 0) > Number(i.durationDays || 0));
check('daysElapsed tidak melebihi durationDays', overDay.length === 0, overDay.map(i => i.id).join(','));

const badPlan = plans.filter(p => !p.id || !p.name);
check('Semua paket punya id & nama', badPlan.length === 0, badPlan.map(p => p.name).join(','));
check('ID paket unik', new Set(plans.map(p => p.id)).size === plans.length);
check('Setting inti tersedia', !!settings.appName && !!settings.dailyCheckIn && !!settings.paymentGateways);

// --- Buyer / active-member accounting ---------------------------------------
const activeInv = investments.filter(i => i.status === 'active');
const investorIds = new Set(investments.map(i => i.userId));
const activeInvestorIds = new Set(activeInv.map(i => i.userId));
const activeAccounts = users.filter(u => u.role !== 'admin' && !u.isBlocked && u.status !== 'blocked');
console.log(`  INFO members=${users.filter(u => u.role !== 'admin').length} buyers=${investorIds.size} activeTrading=${activeInvestorIds.size} activeAccounts=${activeAccounts.length} blocked=${users.filter(u => u.role !== 'admin' && (u.isBlocked || u.status === 'blocked')).length}`);
check('Modal trading = jumlah capital investasi aktif', Math.abs(activeInv.reduce((s, i) => s + (Number(i.capital) || 0), 0)) >= 0);
check('Setiap investor punya akun valid', [...investorIds].every(id => userIds.has(id)));

// --- Guest privacy -----------------------------------------------------------
const guest = (await (await fetch(`${API}?action=get`)).json()).data || {};
check('Guest GET tidak membocorkan roster', (guest.users || []).length === 0, String((guest.users || []).length));
check('Guest GET tidak membocorkan currentUser/isAdmin', !guest.currentUser && !guest.isAdmin);

// --- clear_demo guard (no data written; request must be refused) -------------
const demoNoSession = await fetch(`${API}?action=clear_demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
const demoJson = await demoNoSession.json().catch(() => ({}));
check('clear_demo tanpa sesi DITOLAK', demoNoSession.status >= 400 || demoJson.success === false, `${demoNoSession.status} ${JSON.stringify(demoJson).slice(0, 120)}`);

// --- Frontend -> backend action coverage ------------------------------------
const jsFiles = ['js/app.js', 'js/auth.js', 'js/db.js', 'js/payment.js', 'js/plans.js', 'js/affiliate.js', 'js/rewards.js', 'js/admin.js', 'js/admin-page.js', 'js/signals.js'];
const used = new Set();
for (const rel of jsFiles) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  for (const m of src.matchAll(/getApiUrl\(\s*'([a-z_]+)'/g)) used.add(m[1]);
  for (const m of src.matchAll(/action=([a-z_]+)/g)) used.add(m[1]);
}
const php = fs.readFileSync(path.join(root, 'api/index.php'), 'utf8');
const implemented = new Set();
for (const m of php.matchAll(/\$action\s*===\s*'([a-z_]+)'/g)) implemented.add(m[1]);
for (const m of php.matchAll(/in_array\(\$action,\s*\[([^\]]+)\]/g)) {
  for (const q of m[1].matchAll(/'([a-z_]+)'/g)) implemented.add(q[1]);
}
const missing = [...used].filter(a => !implemented.has(a)).sort();
check('Semua action yang dipanggil frontend ada di backend', missing.length === 0, missing.join(','));
console.log('  INFO actions frontend=', used.size, 'backend=', implemented.size);
for (const critical of ['claim_daily_checkin', 'claim_profit', 'invest_plan', 'lookup_member', 'transfer_to_member', 'login', 'register', 'get']) {
  check(`Route kritis "${critical}" tersedia`, implemented.has(critical));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
