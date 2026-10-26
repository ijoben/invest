// OFF-LINE test: konsistensi perhitungan profit + audit admin.
//
// Tidak menyentuh jaringan. Yang diverifikasi:
//   1. Riwayat profit yang nominalnya sudah dibayar -> persen dihitung ulang dari
//      nominal/modal, sehingga angka di kartu selalu cocok dengan uang masuk.
//   2. Baris profit hari ini (in_progress) memakai rate kanonik paket dan nominal
//      modal x rate (bukan angka acak dari tempat lain).
//   3. Yield harian admin memakai rate deterministik yang sama dan TIDAK membuat
//      baris ganda untuk hari yang sama.
//   4. Kartu mingguan tidak lagi memakai rate global weeklyProfitHistory /
//      defaultRates untuk hari yang sudah lewat.
//   5. Modal Audit Profit: ringkasan, daftar temuan, tombol perbaikan, dan
//      payload perbaikan per member.
//   6. Template email deposit membedakan pending vs approved.

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

const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

// --- Markup ---------------------------------------------------------------
check('admin.html punya modal audit profit', html.includes('id="adminProfitAuditModal"'));
check('admin.html punya tombol audit di panel member + detail member',
  html.includes('AdminPage.openProfitAuditModal()') && html.includes('AdminPage.openProfitAuditFromDetail()'));
check('admin.html punya tombol perbaikan data profit', html.includes('id="admProfitRepairBtn"'));
check('changelog 2026-10-25 mencatat perbaikan profit & email deposit',
  html.includes('2026-10-25') && html.includes('Profit harian kini selalu cocok') && html.includes('Menunggu Verifikasi Admin'));

// --- DOM ----------------------------------------------------------------
const dom = new JSDOM(html, { url: 'https://autotrading.my.id/admin', runScripts: 'outside-only' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.navigator = dom.window.navigator;

const { Plans } = await import('../js/plans.js');
const { DB } = await import('../js/db.js');
const { AdminPage } = await import('../js/admin-page.js');

const todayWib = DB.getWibDateStr();
const yesterdayWib = DB.getWibDateStr(new Date(Date.now() - 86400000));

const CAPITAL = 2500000;

const db = {
  users: [{ id: 'usr-widy', username: 'widybiz', role: 'user', walletBalance: 0, affiliateBalance: 0, points: 0 }],
  investments: [{
    id: 'inv-widy-1',
    userId: 'usr-widy',
    planId: 'plan-rookie',
    planName: 'Ai Trading Pro',
    capital: CAPITAL,
    minRate: 0.4,
    maxRate: 0.7,
    durationDays: 150,
    daysElapsed: 2,
    status: 'active',
    startDate: '2026-10-20T03:00:00.000Z',
    pendingProfitClaim: 0,
    history: [
      // Sudah dibayar: nominal 50.000 (=2,00%) tetapi tersimpan 1,15% (rate global).
      { day: 1, date: '2026-10-20', rate: 1.15, amount: 50000, status: 'claimed' },
      // Hari ini masih berjalan dengan angka acak dari generator lama.
      { day: 2, date: todayWib, rate: 5.0, amount: 123456, status: 'in_progress' }
    ]
  }],
  transactions: [],
  settings: {
    weekendProfit: { enabled: true },
    todayProfitLossMode: { isLoss: false },
    profitCycleDurationHours: 24,
    weeklyProfitHistory: [
      { dayName: 'Senin', rate: 1.0 }, { dayName: 'Selasa', rate: 1.5 }, { dayName: 'Rabu', rate: 1.2 },
      { dayName: 'Kamis', rate: 1.35 }, { dayName: 'Jumat', rate: 1.15 }, { dayName: 'Sabtu', rate: null },
      { dayName: 'Minggu', rate: 1.1 }
    ]
  },
  plans: [{ id: 'plan-rookie', name: 'Ai Trading Pro', minDailyProfit: 0.4, maxDailyProfit: 0.7, durationDays: 150, minDeposit: 2500000 }]
};

DB.get = () => db;
let saveCalls = 0;
DB.save = async () => { saveCalls++; return true; };
DB.syncFromCloud = async () => db;
DB.startLivePolling = () => {};
DB.initCloudSync = () => {};
AdminPage.renderAll = () => {};

// --- 1. Normalisasi riwayat ------------------------------------------------
Plans.syncUserInvestments('usr-widy');
const inv = db.investments[0];
const claimedRow = inv.history.find(h => h.status === 'claimed');
const todayRow = inv.history.find(h => h.date === todayWib);

check('Baris yang sudah dibayar: persen dihitung ulang dari nominal (2,00%)',
  Math.abs(claimedRow.rate - 2.0) < 0.001, String(claimedRow.rate));
check('Nominal baris yang sudah dibayar tidak diubah',
  claimedRow.amount === 50000, String(claimedRow.amount));
check('Rate hari ini diganti rate kanonik paket (0,4-0,7%)',
  todayRow.rate >= 0.4 && todayRow.rate <= 0.7, String(todayRow.rate));
check('Nominal hari ini = modal x rate kanonik',
  todayRow.amount === Plans.computeProfitAmount(CAPITAL, todayRow.rate), `${todayRow.amount}`);
check('Tidak ada baris ganda untuk hari ini',
  inv.history.filter(h => h.date === todayWib).length === 1, String(inv.history.length));
check('Riwayat disimpan setelah dinormalisasi', saveCalls >= 1, String(saveCalls));

// --- 2. Yield harian admin -------------------------------------------------
db.investments[0].pendingProfitClaim = 0;
db.investments[0].lastProfitYieldDate = null;
const yieldRes = await Plans.yieldDailyProfits(true);
const afterYield = db.investments[0];
check('Yield admin melaporkan 1 paket terdistribusi', yieldRes.updatedCount === 1, JSON.stringify(yieldRes));
check('Yield admin memakai rate kanonik yang sama dengan dashboard',
  afterYield.history.filter(h => h.date === todayWib).length === 1 &&
  Math.abs(afterYield.pendingProfitClaim - Plans.computeProfitAmount(CAPITAL, afterYield.history.find(h => h.date === todayWib).rate)) <= 1,
  `pending=${afterYield.pendingProfitClaim}`);

// --- 3. Kartu mingguan tidak memakai rate global ---------------------------
const weekly = Plans.getWeeklyProfitHistory('usr-widy');
const pastRecords = weekly.records.filter(r => r.isPast && !r.isOff);
const badGlobal = pastRecords.filter(r => r.rate === 1.15 || r.rate === 1.0 || r.rate === 1.35 || r.rate === 1.5 || r.rate === 1.2 || r.rate === 1.1);
check('Tidak ada hari lewat yang menampilkan rate global weeklyProfitHistory',
  badGlobal.length === 0, badGlobal.map(r => `${r.dayName}=${r.rate}`).join(','));
if (pastRecords.length > 0) {
  const withData = pastRecords.find(r => r.fullDate === new Date('2026-10-20T12:00:00+07:00').toLocaleDateString('id-ID'));
  if (withData) {
    check('Hari yang punya riwayat menampilkan persen sesuai nominal',
      Math.abs(withData.rate - 2.0) < 0.001, String(withData.rate));
  } else {
    console.log('  SKIP hari 20/10 bukan bagian minggu berjalan (uji kartu mingguan dilewati).');
  }
  const noData = pastRecords.filter(r => r.rate === null);
  // "Belum Aktif" = paket belum berjalan pada tanggal itu, "Belum Ada Data" =
  // paket berjalan tetapi belum ada riwayat/klaim nyata. Keduanya bukan rate karangan.
  check('Hari tanpa data tampil "-" (bukan angka karangan)',
    noData.every(r => r.displayRate === '-' && (r.statusLabel.includes('Belum Ada Data') || r.statusLabel.includes('Belum Aktif'))),
    noData.map(r => `${r.dayName}:${r.displayRate}:${r.statusLabel}`).join(','));
}

// --- 3b. Klaim (fallback lokal) memakai persen TERTIMBANG modal -----------
// Dua paket dengan modal & rate berbeda: persen yang tampil harus
// total nominal / total modal, bukan rata-rata sederhana antar paket.
db.investments = [
  { id: 'inv-a', userId: 'usr-widy', planId: 'plan-rookie', planName: 'Ai Trading Pro', capital: 1000000, minRate: 0.4, maxRate: 0.7, durationDays: 150, daysElapsed: 1, status: 'active', startDate: '2026-10-01T03:00:00.000Z', pendingProfitClaim: 0,
    history: [{ day: 1, date: yesterdayWib, rate: 2, amount: 20000, status: 'pending_claim' }] },
  { id: 'inv-b', userId: 'usr-widy', planId: 'plan-learn', planName: 'Ai Trading 01', capital: 500000, minRate: 1.5, maxRate: 2.4, durationDays: 45, daysElapsed: 1, status: 'active', startDate: '2026-10-01T03:00:00.000Z', pendingProfitClaim: 0,
    history: [{ day: 1, date: yesterdayWib, rate: 0.5, amount: 2500, status: 'pending_claim' }] }
];
db.transactions = [];
DB.syncToCloud = async () => {};
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('offline'); };
const claimRes = await Plans.claimProfit('usr-widy');
globalThis.fetch = realFetch;
check('Klaim (fallback lokal) berhasil', claimRes.success === true, JSON.stringify(claimRes).slice(0, 160));
check('Nominal klaim = jumlah pending kedua paket', claimRes.amount === 22500, String(claimRes.amount));
check('Persen klaim = nominal / modal total (1,50%), bukan rata-rata paket',
  Math.abs(claimRes.profitRate - 1.5) < 0.01 && claimRes.profitPercent === 'Profit 1,5%',
  `${claimRes.profitRate} / ${claimRes.profitPercent}`);

// --- 4. Audit profit di panel admin ---------------------------------------
const auditResponse = {
  success: true,
  repaired: false,
  summary: { investments: 3, usersChecked: 6, usersWithIssues: 1, rateMismatch: 2, pendingMismatch: 1, totalMismatch: 0, outOfRange: 0, noHistory: 0, fixedRows: 0, fixedPending: 0 },
  users: [{
    userId: 'usr-widy', username: 'widybiz',
    issues: [
      { type: 'nominal_tidak_cocok', investmentId: 'inv-widy-1', plan: 'Ai Trading Pro', detail: 'Baris 2026-10-20 tertulis 1.15% (seharusnya IDR 28.750) tetapi nominalnya IDR 50.000.' },
      { type: 'pending_beda', investmentId: 'inv-widy-1', plan: 'Ai Trading Pro', detail: 'Pending yang akan dibayar IDR 30.000 berbeda dari riwayat IDR 12.000.' }
    ]
  }]
};
let captured = null;
const calls = [];
let nextResponse = auditResponse;
globalThis.fetch = async (url, opts) => {
  captured = { url: String(url), opts, body: opts && opts.body ? JSON.parse(opts.body) : null };
  calls.push(captured);
  return { ok: true, status: 200, json: async () => nextResponse };
};
globalThis.confirm = () => true;

AdminPage.openProfitAuditModal('');
await new Promise(r => setTimeout(r, 0));
check('Audit memanggil endpoint admin_profit_audit', !!captured && captured.url.includes('action=admin_profit_audit'), captured && captured.url);
check('Modal audit terbuka', document.getElementById('adminProfitAuditModal').classList.contains('show'));
check('Ringkasan audit menampilkan jumlah temuan', txt('admProfitAuditSummary').includes('3 temuan'), txt('admProfitAuditSummary'));
check('Daftar audit menampilkan username', txt('admProfitAuditList').includes('@widybiz'), txt('admProfitAuditList'));
check('Daftar audit menampilkan detail temuan', txt('admProfitAuditList').includes('Baris 2026-10-20'), txt('admProfitAuditList'));
check('Tombol perbaikan aktif saat ada temuan', document.getElementById('admProfitRepairBtn').disabled === false);

nextResponse = { success: true, repaired: true, summary: { fixedRows: 1, fixedPending: 1 }, users: [] };
await AdminPage.repairProfitData();
const repairCall = calls.filter(c => c.url.includes('action=admin_profit_repair')).pop();
check('Perbaikan memanggil endpoint admin_profit_repair via POST',
  !!repairCall && repairCall.opts.method === 'POST', repairCall ? repairCall.url : 'tidak ada panggilan');
check('Perbaikan mengirim userId target (kosong = semua member)',
  !!repairCall && repairCall.body && repairCall.body.userId === '', repairCall ? JSON.stringify(repairCall.body) : '-');
check('Setelah perbaikan data audit dimuat ulang', calls.filter(c => c.url.includes('action=admin_profit_audit')).length >= 2, String(calls.length));

AdminPage.openProfitAuditModal('usr-widy');
await new Promise(r => setTimeout(r, 0));
check('Audit per member mengirim userId di query',
  captured.url.includes('userId=usr-widy'), captured.url);
check('Subjudul audit menyebut member target', txt('admProfitAuditSub').includes('widybiz'), txt('admProfitAuditSub'));
AdminPage.closeProfitAuditModal();
check('Modal audit tertutup', !document.getElementById('adminProfitAuditModal').classList.contains('show'));

// --- 5. Email deposit: pending vs approved --------------------------------
const mailPhp = fs.readFileSync(path.join(root, 'api', 'mail.php'), 'utf8');
check('Template deposit punya cabang "MENUNGGU VERIFIKASI"', mailPhp.includes('MENUNGGU VERIFIKASI'));
check('Template pending menyatakan saldo belum bertambah', mailPhp.includes('saldo utama Anda belum bertambah'));
check('Template approved menyebut diverifikasi & disetujui Tim Admin',
  mailPhp.includes('telah diverifikasi dan disetujui oleh Tim Admin'));
check('Status email deposit dibaca dari payload', mailPhp.includes("$data['status']"));

const paymentJs = fs.readFileSync(path.join(root, 'js', 'payment.js'), 'utf8');
check('Member mengirim email deposit dengan status pending',
  paymentJs.includes("dispatchMailApi('deposit'") && paymentJs.includes("status: 'pending'"));
const adminJs = fs.readFileSync(path.join(root, 'js', 'admin.js'), 'utf8');
check('Admin approve mengirim email deposit dengan status approved',
  adminJs.includes("dispatchMailApi('deposit'") && adminJs.includes("status: 'approved'"));

console.log(`\n===== HASIL: ${pass} PASS, ${fail} FAIL =====`);
process.exit(fail === 0 ? 0 : 1);
