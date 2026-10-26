// LIVE test: fitur admin "Reset Total Data Member".
//
// Semua dilakukan pada akun test disposable yang dibuat khusus oleh skrip ini
// (register -> seed saldo/paket/transaksi -> reset -> verifikasi -> hapus akun).
// Tidak ada data member asli yang disentuh.
//
// Yang diverifikasi di server produksi:
//   1. Seed menghasilkan saldo, transaksi dan paket investasi milik akun test.
//   2. admin_reset_member MENOLAK: tanpa sesi admin, alasan kependekan,
//      username konfirmasi salah, dan target akun admin.
//   3. Reset sukses mengosongkan saldo/poin dan menghapus transaksi + paket
//      di tabel relasional MAUPUN JSON state (dicek lewat action=get).
//   4. Snapshot browser lama (action=save) tidak bisa menghidupkan lagi data
//      yang sudah direset (guard reset_at).
//   5. admin_reset_logs mencatat siapa, target, alasan, dan apa yang dihapus.
//   6. delete_user membersihkan akun test kembali (hard delete, tanpa riwayat).

const API = 'https://autotrading.my.id/api/index.php';

// Password admin TIDAK ditulis di skrip: jalankan dengan
//   ADMIN_PASSWORD="..." node scripts/test-member-reset-live.mjs
const adminPass = process.env.ADMIN_PASSWORD || '';
if (!adminPass) {
  console.error('ADMIN_PASSWORD wajib diisi lewat environment (jangan tempel password di chat/repo).');
  process.exit(2);
}

let pass = 0, fail = 0;
function check(label, ok, extra = '') {
  if (ok) { pass++; console.log('  OK   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra ? '  <' + extra + '>' : '')); }
}

async function parseRes(res, what) {
  const text = await res.text();
  try { return JSON.parse(text); }
  catch (e) { throw new Error(`${what}: HTTP ${res.status}, non-JSON body: ${text.slice(0, 200)}`); }
}

async function rawPost(action, body, token = '') {
  const res = await fetch(`${API}?action=${action}${token ? `&sessionToken=${encodeURIComponent(token)}` : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
  return parseRes(res, `POST ${action}`);
}

async function rawPostStatus(action, body, token = '') {
  const res = await fetch(`${API}?action=${action}${token ? `&sessionToken=${encodeURIComponent(token)}` : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
  const json = await parseRes(res, `POST ${action}`);
  return { status: res.status, json };
}

async function rawGet(action, params = '', token = '') {
  const res = await fetch(`${API}?action=${action}${params ? '&' + params : ''}${token ? `&sessionToken=${encodeURIComponent(token)}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseRes(res, `GET ${action}`);
}

const stamp = Date.now().toString().slice(-7);
const username = `rsttest${stamp}`;
const email = `rsttest${stamp}@example.com`;
const password = 'Test123456';

const txOf = (state, uid) => (state.transactions || []).filter(t => t.userId === uid);
const invOf = (state, uid) => (state.investments || []).filter(i => i.userId === uid);
const userOf = (state, uid) => (state.users || []).find(u => u.id === uid);

let adminToken = '';
let memberToken = '';
let userId = '';
let staleTransactions = [];
let staleInvestments = [];
let staleUser = null;

try {
  console.log('===============================================================');
  console.log('LIVE TEST: RESET TOTAL DATA MEMBER | akun test:', username, new Date().toISOString());
  console.log('===============================================================\n');

  // --- 0. API sehat ----------------------------------------------------------
  const ping = await rawGet('ping');
  check('API ping OK', ping && (ping.success === true || ping.status === 'ok'), JSON.stringify(ping).slice(0, 120));

  // --- 1. Buat akun test disposable ------------------------------------------
  console.log('1. Registrasi akun test disposable...');
  const reg = await rawPost('register', { username, email, password, fullName: 'RST Test Member' });
  check('Registrasi akun test berhasil', reg.success === true, JSON.stringify(reg).slice(0, 200));

  const memLogin = await rawPost('login', { identifier: username, password });
  check('Login member test berhasil', memLogin.success === true && !!memLogin.sessionToken, JSON.stringify(memLogin).slice(0, 160));
  memberToken = memLogin.sessionToken || '';
  userId = (memLogin.user && memLogin.user.id) || '';
  check('user id terbaca', !!userId, userId);

  const admLogin = await rawPost('login', { identifier: process.env.ADMIN_IDENTIFIER || 'admin', password: adminPass });
  check('Login admin berhasil', admLogin.success === true && !!admLogin.sessionToken, JSON.stringify(admLogin).slice(0, 160));
  adminToken = admLogin.sessionToken || '';
  if (!adminToken || !userId) process.exit(1);

  // Bersihkan akun test dari run sebelumnya (hanya akun rsttest* tanpa riwayat)
  const pre = await rawGet('get', '', adminToken);
  const leftovers = ((pre.data || {}).users || []).filter(u => /^rsttest\d+$/.test(u.username || '') && u.id !== userId);
  if (leftovers.length === 0) console.log('   (tidak ada akun test lama yang tertinggal)');
  for (const lu of leftovers) {
    const ltx = txOf(pre.data, lu.id).length;
    const linv = invOf(pre.data, lu.id).length;
    if (ltx === 0 && linv === 0) {
      const d = await rawPost('delete_user', { userId: lu.id }, adminToken);
      check('Membersihkan akun test lama ' + lu.username, d.success === true && !d.isSoftDeleted, JSON.stringify(d).slice(0, 140));
    }
  }

  // --- 2. Seed data member ---------------------------------------------------
  console.log('2. Seed saldo, poin, transaksi & paket investasi...');
  const seed = await rawPost('admin_update_user', {
    userId,
    walletBalance: 500000,
    affiliateBalance: 77777,
    points: 42,
    adjustmentNote: 'seed data uji reset'
  }, adminToken);
  check('admin_update_user menyetor saldo & poin test', seed.success === true, JSON.stringify(seed).slice(0, 180));

  const invest = await rawPost('invest_plan', { userId, planId: 'plan-learn', amount: 100000 }, memberToken);
  check('invest_plan membuat paket investasi test', invest.success === true, JSON.stringify(invest).slice(0, 180));

  let get = await rawGet('get', '', adminToken);
  check('GET state sebelum reset OK', get.success === true, get.message || '');
  let before = get.data;
  const beforeUser = userOf(before, userId) || {};
  const beforeTx = txOf(before, userId);
  const beforeInv = invOf(before, userId);
  check('Saldo wallet terisi sebelum reset (' + beforeUser.walletBalance + ')', Number(beforeUser.walletBalance) > 0, String(beforeUser.walletBalance));
  check('Saldo afiliasi terisi sebelum reset (' + beforeUser.affiliateBalance + ')', Number(beforeUser.affiliateBalance) > 0, String(beforeUser.affiliateBalance));
  check('Poin terisi sebelum reset (' + beforeUser.points + ')', Number(beforeUser.points) > 0, String(beforeUser.points));
  check('Ada transaksi milik akun test (' + beforeTx.length + ')', beforeTx.length >= 1, String(beforeTx.length));
  check('Ada paket investasi milik akun test (' + beforeInv.length + ')', beforeInv.length >= 1, String(beforeInv.length));

  staleTransactions = JSON.parse(JSON.stringify(beforeTx));
  staleInvestments = JSON.parse(JSON.stringify(beforeInv));
  staleUser = JSON.parse(JSON.stringify(beforeUser));

  // --- 3. Pengaman server ----------------------------------------------------
  console.log('3. Pengaman endpoint admin_reset_member...');
  const noAuth = await rawPostStatus('admin_reset_member', { userId, confirmUsername: username, reason: 'alasan uji tanpa sesi admin' });
  check('Tanpa sesi admin ditolak (401/403)', noAuth.status === 401 || noAuth.status === 403, String(noAuth.status));

  const shortReason = await rawPostStatus('admin_reset_member', { userId, confirmUsername: username, reason: 'abc' }, adminToken);
  check('Alasan < 5 karakter ditolak (400)', shortReason.status === 400, String(shortReason.status) + ' ' + JSON.stringify(shortReason.json).slice(0, 120));

  const wrongName = await rawPostStatus('admin_reset_member', { userId, confirmUsername: 'bukan' + username, reason: 'alasan uji konfirmasi salah' }, adminToken);
  check('Username konfirmasi salah ditolak (403)', wrongName.status === 403, String(wrongName.status) + ' ' + JSON.stringify(wrongName.json).slice(0, 140));

  const resetAdmin = await rawPostStatus('admin_reset_member', { userId: 'usr-admin', confirmUsername: 'admin', reason: 'alasan uji target admin' }, adminToken);
  check('Akun admin tidak bisa direset (403)', resetAdmin.status === 403, String(resetAdmin.status));

  get = await rawGet('get', '', adminToken);
  const stillThere = txOf(get.data, userId).length;
  check('Percobaan yang ditolak tidak menghapus data (' + stillThere + ' transaksi utuh)', stillThere === beforeTx.length, String(stillThere));

  // --- 4. Reset total --------------------------------------------------------
  console.log('4. Menjalankan reset total...');
  const reason = 'Manipulasi bukti transfer / akun ganda (uji live fitur reset)';
  const reset = await rawPost('admin_reset_member', { userId, confirmUsername: username, reason }, adminToken);
  check('admin_reset_member sukses', reset.success === true, JSON.stringify(reset).slice(0, 240));
  check('Pesan sukses berisi ringkasan penghapusan', /berhasil direset total/i.test(reset.message || ''), reset.message || '');
  check('Ringkasan melaporkan ' + beforeTx.length + ' transaksi terhapus',
    reset.summary && reset.summary.transactions === beforeTx.length, JSON.stringify(reset.summary || {}));
  check('Ringkasan melaporkan ' + beforeInv.length + ' paket terhapus',
    reset.summary && reset.summary.investments === beforeInv.length, JSON.stringify(reset.summary || {}));

  // --- 5. Verifikasi setelah reset ------------------------------------------
  console.log('5. Verifikasi database & JSON state...');
  get = await rawGet('get', '', adminToken);
  const after = get.data;
  const afterUser = userOf(after, userId) || {};
  const afterTx = txOf(after, userId);
  const afterInv = invOf(after, userId);
  check('Saldo wallet = 0', Number(afterUser.walletBalance || 0) === 0, String(afterUser.walletBalance));
  check('Saldo afiliasi = 0', Number(afterUser.affiliateBalance || 0) === 0, String(afterUser.affiliateBalance));
  check('Poin = 0', Number(afterUser.points || 0) === 0, String(afterUser.points));
  check('Transaksi akun test hilang total (dari ' + beforeTx.length + ')', afterTx.length === 0, String(afterTx.length));
  check('Paket investasi hilang total (dari ' + beforeInv.length + ')', afterInv.length === 0, String(afterInv.length));
  check('Akun test tetap ada (profil/login dipertahankan)', !!afterUser.id, JSON.stringify({ id: afterUser.id, username: afterUser.username }));

  const totalTxAround = (after.transactions || []).length;
  check('Transaksi member lain tidak ikut terhapus (state tetap berisi ' + totalTxAround + ' trx)', totalTxAround > 0, String(totalTxAround));

  // --- 6. Snapshot lama tidak bisa menghidupkan data lagi --------------------
  console.log('6. Uji guard reset_at terhadap snapshot browser lama...');
  const staleSave = await rawPost('save', {
    users: [staleUser],
    transactions: staleTransactions,
    investments: staleInvestments
  }, memberToken);
  check('save dengan snapshot lama diterima server', staleSave && typeof staleSave.success === 'boolean', JSON.stringify(staleSave).slice(0, 160));

  get = await rawGet('get', '', adminToken);
  const resurrectTx = txOf(get.data, userId).length;
  const resurrectInv = invOf(get.data, userId).length;
  check('Transaksi lama TIDAK hidup kembali setelah save snapshot lama (' + resurrectTx + ')', resurrectTx === 0, String(resurrectTx));
  check('Paket investasi lama TIDAK hidup kembali (' + resurrectInv + ')', resurrectInv === 0, String(resurrectInv));
  const resurrectUser = userOf(get.data, userId) || {};
  check('Saldo tetap 0 setelah save snapshot lama', Number(resurrectUser.walletBalance || 0) === 0, String(resurrectUser.walletBalance));

  // --- 7. Log audit ----------------------------------------------------------
  console.log('7. Memeriksa log audit admin...');
  const logs = await rawGet('admin_reset_logs', '', adminToken);
  check('admin_reset_logs sukses', logs.success === true, JSON.stringify(logs).slice(0, 160));
  const entry = (logs.logs || []).find(l => l.targetUsername === username);
  check('Ada entri log untuk akun test', !!entry, JSON.stringify((logs.logs || []).slice(0, 2)));
  if (entry) {
    check('Log mencatat admin pelaku', entry.adminUsername === 'admin', entry.adminUsername);
    check('Log mencatat alasan persis', entry.reason === reason, entry.reason);
    check('Log mencatat saldo sebelum reset (' + (entry.details || {}).walletBalanceBefore + ')',
      Number((entry.details || {}).walletBalanceBefore || 0) === Number(staleUser.walletBalance || 0), JSON.stringify(entry.details));
    check('Log mencatat jumlah transaksi terhapus',
      Number((entry.details || {}).transactionsDeleted || 0) === beforeTx.length, JSON.stringify(entry.details));
    check('Log mencatat jumlah paket terhapus',
      Number((entry.details || {}).investmentsDeleted || 0) === beforeInv.length, JSON.stringify(entry.details));
  }

  // --- 8. Konfirmasi UI (admin.html sudah terdeploy) --------------------------
  const adminHtml = await (await fetch('https://autotrading.my.id/admin.html')).text();
  check('admin.html live punya modal reset', adminHtml.includes('id="adminResetMemberModal"'));
  check('admin.html live punya changelog reset 2026-10-24', adminHtml.includes('2026-10-24') && adminHtml.includes('Reset total data member'));

  // --- 9. Cleanup akun test ---------------------------------------------------
  console.log('9. Pembersihan akun test...');
  const del = await rawPost('delete_user', { userId }, adminToken);
  check('delete_user menghapus akun test (hard delete)', del.success === true && !del.isSoftDeleted, JSON.stringify(del).slice(0, 200));
  get = await rawGet('get', '', adminToken);
  check('Akun test hilang dari state', !userOf(get.data, userId), JSON.stringify({ found: !!userOf(get.data, userId) }));
  const delTrx = txOf(get.data, userId).length;
  check('Tidak ada sisa transaksi akun test', delTrx === 0, String(delTrx));

} catch (e) {
  fail++;
  console.log('  FAIL fatal: ' + e.message);
} finally {
  // Best-effort cleanup bila langkah sebelumnya gagal di tengah jalan.
  if (userId && adminToken) {
    try {
      const still = await rawGet('get', '', adminToken);
      if (userOf(still.data, userId)) {
        await rawPost('delete_user', { userId }, adminToken);
        console.log('  (cleanup darurat: akun test dihapus kembali)');
      }
    } catch (e) {}
  }
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
