// Offline jsdom test untuk fitur admin "Reset Total Data Member".
//
// Tidak menyentuh jaringan: fetch, DB.syncFromCloud dan renderAll di-mock,
// sehingga aman dijalankan kapan pun. Yang diverifikasi:
//   1. admin.html punya modal, field konfirmasi, tombol di baris member,
//      tombol di modal detail, dan catatan changelog.
//   2. Tombol reset tampil untuk member dan TIDAK tampil untuk akun admin.
//   3. Ringkasan data member terisi saat modal dibuka.
//   4. Tombol HAPUS hanya aktif bila alasan >= 5 karakter DAN username target
//      ditulis persis (case-insensitive).
//   5. Payload yang dikirim ke server persis { userId, confirmUsername, reason }.
//   6. Reset sukses -> modal tertutup + state disinkronkan ulang.
//   7. Reset gagal (server menolak) -> modal tetap terbuka + toast error.
//   8. Log reset terakhir dirender dari respons server.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
function check(label, ok, extra = '') {
  if (ok) { pass++; console.log('  OK   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra ? '  <' + extra + '>' : '')); }
}
const txt = (id) => (document.getElementById(id)?.textContent || '').trim();
const val = (id) => (document.getElementById(id)?.value || '');

// --- admin.html markup -------------------------------------------------------
const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
check('admin.html punya modal adminResetMemberModal', html.includes('id="adminResetMemberModal"'));
check('admin.html punya field alasan + konfirmasi + tombol submit',
  html.includes('id="admResetReason"') && html.includes('id="admResetConfirm"') && html.includes('id="admResetSubmitBtn"'));
check('admin.html punya daftar riwayat log reset', html.includes('id="admResetLogList"'));
check('admin.html punya tombol reset di modal Detail Member', html.includes('AdminPage.openResetMemberModalFromDetail()'));
check('admin.html punya catatan changelog reset (2026-10-24)',
  html.includes('2026-10-24') && html.includes('Reset total data member'));

// --- DOM environment (markup admin asli) ------------------------------------
const dom = new JSDOM(html, { url: 'https://autotrading.my.id/admin', runScripts: 'outside-only' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.navigator = dom.window.navigator;

const { AdminPage } = await import('../js/admin-page.js');
const { DB } = await import('../js/db.js');
const { Admin } = await import('../js/admin.js');

const data = {
  users: [
    { id: 'usr-admin', username: 'admin', role: 'admin', fullName: 'Administrator', walletBalance: 0, affiliateBalance: 0, points: 0 },
    { id: 'usr-cheat', username: 'cheater1', role: 'user', fullName: 'Si Curang', walletBalance: 1500000, affiliateBalance: 250000, points: 30 },
    { id: 'usr-clean', username: 'cleanuser', role: 'user', fullName: 'Bersih', walletBalance: 0, affiliateBalance: 0, points: 0 }
  ],
  transactions: [
    { id: 'TRX-DEP-1', userId: 'usr-cheat', username: 'cheater1', type: 'deposit', amount: 1000000, status: 'approved', createdAt: '2026-10-01T00:00:00.000Z' },
    { id: 'TRX-WDR-1', userId: 'usr-cheat', username: 'cheater1', type: 'withdraw', amount: 500000, status: 'pending', createdAt: '2026-10-02T00:00:00.000Z' },
    { id: 'TRX-DEP-9', userId: 'usr-clean', username: 'cleanuser', type: 'deposit', amount: 50000, status: 'approved', createdAt: '2026-10-03T00:00:00.000Z' }
  ],
  investments: [
    { id: 'inv-1', userId: 'usr-cheat', planId: 'plan-learn', planName: 'Learn', capital: 500000, status: 'active', createdAt: '2026-10-01T00:00:00.000Z' }
  ],
  redemptions: [
    { id: 'red-1', userId: 'usr-cheat', username: 'cheater1', rewardName: 'E-Wallet', pointsCost: 50, createdAt: '2026-10-04T00:00:00.000Z' }
  ],
  settings: {}, plans: []
};

const originalGet = DB.get.bind(DB);
DB.get = () => data;
DB.startLivePolling = () => {};
DB.initCloudSync = () => {};
let syncFromCloudCalls = 0;
DB.syncFromCloud = async () => { syncFromCloudCalls++; return data; };
AdminPage.renderAll = () => {};

// Semua panggilan jaringan diarahkan ke mock: permintaan terakhir dicatat di
// `captured`, respons diambil dari `nextResponse`.
let captured = null;
let nextResponse = { success: true, logs: [] };
globalThis.fetch = async (url, opts) => {
  captured = { url: String(url), opts };
  return { ok: true, status: 200, json: async () => nextResponse };
};

// --- 1. Tombol reset di tabel member ----------------------------------------
AdminPage.paginationState.users.page = 1;
AdminPage.paginationState.users.perPage = 100;
AdminPage.userFilter = 'all';
AdminPage.userSearchQuery = '';
AdminPage.renderUsers(data);
const rows = [...document.querySelectorAll('#usersTableBody tr')];
const rowFor = (name) => rows.find(r => (r.querySelector('td')?.textContent || '').trim() === name);

const cheatRow = rowFor('cheater1');
check('Baris member biasa punya tombol ♻️ Reset', !!cheatRow && cheatRow.innerHTML.includes('openResetMemberModal'), cheatRow ? 'no button' : 'row missing');
const nonAdmin = data.users.filter(u => u.role !== 'admin');
const rowsWithReset = rows.filter(r => r.innerHTML.includes('openResetMemberModal')).length;
check('Tepat semua baris member (non-admin) yang punya tombol reset', rowsWithReset === nonAdmin.length, `${rowsWithReset}/${nonAdmin.length}`);
check('Baris akun admin tidak dirender di tabel member', !rowFor('admin'));

// --- 2. Modal terbuka & ringkasan terisi ------------------------------------
AdminPage.openResetMemberModal('usr-cheat');
check('Modal reset terbuka', document.getElementById('adminResetMemberModal').classList.contains('show'));
check('Target username tampil di modal', txt('admResetTargetName') === 'cheater1', txt('admResetTargetName'));
check('Ringkasan member terisi', txt('admResetSummaryUser').includes('cheater1') && txt('admResetSummaryUser').includes('Si Curang'), txt('admResetSummaryUser'));
check('Ringkasan saldo dompet memakai data member', txt('admResetSummaryWallet').includes('1.500.000'), txt('admResetSummaryWallet'));
check('Ringkasan saldo afiliasi benar', txt('admResetSummaryAff').includes('250.000'), txt('admResetSummaryAff'));
check('Ringkasan poin benar', txt('admResetSummaryPoints') === '30', txt('admResetSummaryPoints'));
check('Ringkasan transaksi = 2 transaksi', txt('admResetSummaryTx').startsWith('2 transaksi'), txt('admResetSummaryTx'));
check('Ringkasan paket = 1 paket (1 aktif)', txt('admResetSummaryInv') === '1 paket (1 aktif)', txt('admResetSummaryInv'));
check('Ringkasan penukaran poin = 1', txt('admResetSummaryRed') === '1 penukaran poin', txt('admResetSummaryRed'));
check('Tombol submit masih disabled saat modal terbuka', document.getElementById('admResetSubmitBtn').disabled === true);
check('Field konfirmasi & alasan dikosongkan tiap buka', val('admResetConfirm') === '' && val('admResetReason') === '');

// --- 3. Gating konfirmasi ----------------------------------------------------
const reasonEl = document.getElementById('admResetReason');
const confirmEl = document.getElementById('admResetConfirm');
const submitBtn = document.getElementById('admResetSubmitBtn');

reasonEl.value = 'manipulasi bukti transfer';
confirmEl.value = 'cheater1x';
AdminPage.validateResetForm();
check('Username salah -> tombol tetap disabled', submitBtn.disabled === true);

confirmEl.value = 'CHEATER1';
AdminPage.validateResetForm();
check('Username beda kapital tetap dianggap cocok (case-insensitive)', submitBtn.disabled === false);

confirmEl.value = 'cheater1';
reasonEl.value = 'abc';
AdminPage.validateResetForm();
check('Alasan < 5 karakter -> tombol disabled', submitBtn.disabled === true);

reasonEl.value = 'akun ganda / saldo tidak valid';
AdminPage.validateResetForm();
check('Alasan valid + username cocok -> tombol aktif', submitBtn.disabled === false);
check('Hint konfirmasi berubah jadi hijau', txt('admResetConfirmHint').includes('Username cocok'), txt('admResetConfirmHint'));

// --- 4. Payload yang dikirim ke server --------------------------------------
captured = null;
nextResponse = { success: true, message: 'Data member berhasil direset total.', summary: {} };

await AdminPage.submitResetMember();
check('Reset memanggil action=admin_reset_member', !!captured && captured.url.includes('action=admin_reset_member'), captured ? captured.url : 'no fetch');
const sentBody = captured ? JSON.parse(captured.opts.body) : {};
check('Payload persis { userId, confirmUsername, reason }',
  sentBody.userId === 'usr-cheat' && sentBody.confirmUsername === 'cheater1' && sentBody.reason === 'akun ganda / saldo tidak valid',
  JSON.stringify(sentBody));
check('Reset sukses -> modal ditutup', !document.getElementById('adminResetMemberModal').classList.contains('show'));
check('Reset sukses -> state disinkronkan ulang (syncFromCloud dipanggil)', syncFromCloudCalls > 0, String(syncFromCloudCalls));
check('Tembusan tombol kembali berlabel normal', submitBtn.textContent.includes('HAPUS TOTAL'), submitBtn.textContent);

// --- 5. Server menolak -> modal tetap terbuka --------------------------------
AdminPage.openResetMemberModal('usr-cheat');
reasonEl.value = 'alasan test penolakan';
confirmEl.value = 'cheater1';
nextResponse = { success: false, message: 'Konfirmasi username tidak cocok. Reset dibatalkan.' };
captured = null;
await AdminPage.submitResetMember();
check('Reset ditolak server -> modal TETAP terbuka', document.getElementById('adminResetMemberModal').classList.contains('show'));
check('Reset ditolak server -> permintaan tetap terkirim', !!captured && captured.url.includes('action=admin_reset_member'));

// --- 6. Admin tidak bisa mereset akun admin ---------------------------------
AdminPage.closeResetMemberModal();
AdminPage.openResetMemberModal('usr-admin');
check('Akun admin ditolak, modal tidak terbuka', !document.getElementById('adminResetMemberModal').classList.contains('show'));
check('Member tidak ditemukan juga ditolak', (AdminPage.openResetMemberModal('usr-404'), !document.getElementById('adminResetMemberModal').classList.contains('show')));

// --- 7. Tombol di modal Detail Member ----------------------------------------
const hidden = document.getElementById('admMemDetailUserId');
check('Modal Detail punya input hidden userId', !!hidden);
if (hidden) {
  hidden.value = 'usr-cheat';
  AdminPage.openResetMemberModalFromDetail();
  check('Tombol dari modal Detail membuka modal reset', document.getElementById('adminResetMemberModal').classList.contains('show'));
  AdminPage.closeResetMemberModal();
}

// --- 8. Log reset terakhir dirender -----------------------------------------
globalThis.fetch = async (url) => ({
  ok: true, status: 200,
  json: async () => ({
    success: true,
    logs: [{
      id: '1',
      adminUsername: 'admin',
      targetUsername: 'cheater1',
      action: 'admin_reset_member',
      reason: 'manipulasi bukti transfer',
      details: { walletBalanceBefore: 1500000, transactionsDeleted: 2, investmentsDeleted: 1 },
      createdAt: '2026-10-24 10:00:00'
    }]
  })
});
AdminPage.openResetMemberModal('usr-cheat');
await AdminPage.loadResetLogs();
const logHtml = document.getElementById('admResetLogList').innerHTML;
check('Log reset dirender (target, admin, alasan)', logHtml.includes('cheater1') && logHtml.includes('admin') && logHtml.includes('manipulasi bukti transfer'), logHtml.slice(0, 160));
check('Detail log menampilkan data yang dihapus', logHtml.includes('2 transaksi') && logHtml.includes('1 paket'), logHtml.slice(0, 240));
AdminPage.closeResetMemberModal();

DB.get = originalGet;
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
