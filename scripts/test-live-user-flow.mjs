import { DB } from '../js/db.js';
import { Auth } from '../js/auth.js';

console.log('--- TESTING LIVE USER REGISTRATION & MANUAL LOGIN ---');

// 1. Guest GET must be leak-free: the user roster and session-derived keys are
//    session-gated by the privacy hardening (BUG-001), so a guest payload must
//    never carry users / currentUser / isAdmin.
const resGet = await fetch('https://autotrading.my.id/api/index.php?action=get');
const dataGet = await resGet.json();
const guestUsers = dataGet?.data?.users || [];
console.log('Guest GET exposed users:', guestUsers.length, '(roster is session-gated by design)');
if (guestUsers.length !== 0) {
  console.error('[FAIL] Guest GET exposes the user roster!');
  process.exit(1);
}
if (dataGet?.data?.currentUser || dataGet?.data?.isAdmin) {
  console.error('[FAIL] Session-derived keys leaked to guest payload:', {
    currentUser: dataGet?.data?.currentUser?.id,
    isAdmin: dataGet?.data?.isAdmin
  });
  process.exit(1);
}
console.log('[PASS] Guest payload leak-free (no roster / currentUser / isAdmin)');

// 2. Test manual admin login against the live master account.
//    Identity is verified from the authenticated server login response (the
//    roster itself is intentionally hidden from guests). Credentials come from
//    the environment so the harness never assumes the old default password.
const adminId = process.env.ADMIN_IDENTIFIER || 'admin';
const adminPass = process.env.ADMIN_PASSWORD || '';
if (!adminPass) {
  console.error('[SKIP] ADMIN_PASSWORD not set: cannot verify the live master admin account.');
  process.exit(2);
}
const adminLoginRes = await Auth.login(adminId, adminPass);
const adminAccount = adminLoginRes && adminLoginRes.user;
if (adminAccount && adminAccount.role === 'admin' && adminLoginRes.success && adminLoginRes.sessionToken) {
  console.log('[PASS] Live Master Admin Account verified: ' + adminId + ' (role: admin, balance: Rp ' + (adminAccount.walletBalance || 0) + ', server session: yes)');
} else {
  console.error('[FAIL] Master Admin Account mismatch:', adminAccount, adminLoginRes);
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
