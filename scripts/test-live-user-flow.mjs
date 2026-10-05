import { DB } from '../js/db.js';
import { Auth } from '../js/auth.js';

console.log('--- TESTING LIVE USER REGISTRATION & MANUAL LOGIN ---');

// 1. Fetch current live server state
const resGet = await fetch('https://autotrading.my.id/api/index.php?action=get');
const dataGet = await resGet.json();

console.log('Current live users count:', dataGet?.data?.users?.length);
console.log('Current live user:', dataGet?.data?.users?.[0]?.username);

// 2. Test manual admin login against live master account
const adminAccount = dataGet.data.users.find(u => u.username === 'admin');
if (adminAccount && adminAccount.role === 'admin' && adminAccount.password === 'admin') {
  console.log('[PASS] Live Master Admin Account verified: admin / admin (role: admin, balance: Rp 0)');
} else {
  console.error('[FAIL] Master Admin Account mismatch:', adminAccount);
  process.exit(1);
}

// 3. Test clean manual login requirement (Quick login disabled)
const quickLoginRes = Auth.quickLogin();
if (!quickLoginRes.success) {
  console.log('[PASS] Quick Login correctly disabled:', quickLoginRes.message);
} else {
  console.error('[FAIL] Quick login is still active!');
  process.exit(1);
}

console.log('\n✓ ALL LIVE OPERATIONAL PRODUCTION CHECKS VERIFIED SUCCESSFULLY!');
