// LIVE verification for the admin "Manajemen Pengguna" panel.
//
// Read-only: only logs in as admin and fetches state. It never writes, never
// resets demo data, and never deletes a member.
//
// What is verified:
//   1. Counter tabs (Semua / Sudah Beli / Aktif / Diblokir) match the live DB.
//   2. Tab "Sudah Beli" only lists members with a purchase (investment record).
//   3. Portfolio column distinguishes active plan, finished plan, and never bought.
//   4. Search still narrows the list while keeping the buyer badge.
//   5. admin.html carries the 2026-10-20 changelog note.
//
// Requires ADMIN_PASSWORD (admin identity defaults to "admin").

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

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
function check(label, ok, extra = '') {
  if (ok) { pass++; console.log('  OK   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra ? '  <' + extra + '>' : '')); }
}

const loginRes = await fetch(`${API}?action=login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: adminId, password: adminPass })
});
const loginJson = await loginRes.json();
check('Admin login', loginJson.success === true && loginJson.user?.role === 'admin', JSON.stringify(loginJson).slice(0, 200));
if (!loginJson.success || !loginJson.sessionToken) process.exit(1);

const getRes = await fetch(`${API}?action=get&sessionToken=${encodeURIComponent(loginJson.sessionToken)}`);
const getJson = await getRes.json();
check('GET state', getJson.success === true && !!getJson.data, getJson.message || '');
if (!getJson.success) process.exit(1);
const data = getJson.data;

// --- DOM environment (real admin.html markup) --------------------------------
const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const dom = new JSDOM(html, { url: 'https://autotrading.my.id/admin', runScripts: 'outside-only' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.navigator = dom.window.navigator;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;

const { AdminPage } = await import('../js/admin-page.js');
const { DB } = await import('../js/db.js');

// The panel is rendered by users clicking tabs, which re-read DB.get(); point it
// at the authoritative live payload for this harness.
const originalGet = DB.get.bind(DB);
DB.get = () => data;
// No background polling / network sync during the DOM test.
DB.startLivePolling = () => {};
DB.initCloudSync = () => {};
DB.syncFromCloud = async () => data;

const nonAdmin = (data.users || []).filter(u => u.role !== 'admin');
const isBlocked = (u) => !!(u.isBlocked || u.status === 'blocked');
const investments = data.investments || [];
const buyerIds = new Set(investments.map(i => i && i.userId).filter(Boolean));
const expectedBuyers = nonAdmin.filter(u => buyerIds.has(u.id));
const expectedActive = nonAdmin.filter(u => !isBlocked(u));
const expectedBlocked = nonAdmin.filter(isBlocked);

// Render all rows in one page so counting is deterministic.
AdminPage.paginationState.users.page = 1;
AdminPage.paginationState.users.perPage = 1000;
AdminPage.userFilter = 'all';
AdminPage.userSearchQuery = '';
AdminPage.renderUsers(data);

const txt = (id) => (document.getElementById(id)?.textContent || '').trim();
check('Counter Semua = ' + expectedBuyers.length + ' buyers / ' + nonAdmin.length + ' members', Number(txt('userCountAll')) === nonAdmin.length, txt('userCountAll'));
check('Counter Sudah Beli = ' + expectedBuyers.length, Number(txt('userCountBuyers')) === expectedBuyers.length, txt('userCountBuyers'));
check('Counter Aktif = ' + expectedActive.length, Number(txt('userCountActive')) === expectedActive.length, txt('userCountActive'));
check('Counter Diblokir = ' + expectedBlocked.length, Number(txt('userCountBlocked')) === expectedBlocked.length, txt('userCountBlocked'));
check('Kolom Portofolio ada di header', /Portofolio/.test(dom.window.document.querySelector('#pane-users thead').textContent));

const rows = () => [...document.querySelectorAll('#usersTableBody tr')];
check('Semua baris dirender', rows().length === nonAdmin.length, String(rows().length));
const neverBoughtRows = nonAdmin.filter(u => !buyerIds.has(u.id)).length;
check('Baris "Belum Beli" sesuai', rows().filter(r => r.textContent.includes('Belum Beli')).length === neverBoughtRows);

// --- Tab Sudah Beli ----------------------------------------------------------
AdminPage.setUserFilter('buyers');
const buyerRows = rows();
check('Tab Sudah Beli menyaring tepat ' + expectedBuyers.length + ' member', buyerRows.length === expectedBuyers.length, String(buyerRows.length));
check('Setiap baris Sudah Beli punya badge portofolio', buyerRows.every(r => r.textContent.includes('🔥') || r.textContent.includes('✅')));
const renderedNames = buyerRows.map(r => r.querySelector('td')?.textContent.trim());
check('Username di tab sesuai data investasi', expectedBuyers.every(u => renderedNames.includes(u.username)), JSON.stringify(renderedNames));

// --- Search inside the buyer tab --------------------------------------------
const sampleBuyer = expectedBuyers[0];
if (sampleBuyer) {
  AdminPage.userSearchQuery = sampleBuyer.username;
  AdminPage.renderUsers(data);
  const searchRows = rows();
  check('Pencarian "' + sampleBuyer.username + '" mengembalikan 1 baris', searchRows.length === 1, String(searchRows.length));
  check('Hasil pencarian tetap menampilkan paket', /🔥|✅/.test(searchRows[0]?.textContent || ''));
  AdminPage.userSearchQuery = '';
}

// --- Non-buyer safety check --------------------------------------------------
const sampleNonBuyer = nonAdmin.find(u => !buyerIds.has(u.id));
if (sampleNonBuyer) {
  AdminPage.userFilter = 'all';
  AdminPage.userSearchQuery = sampleNonBuyer.username;
  AdminPage.renderUsers(data);
  const nb = rows();
  check('Member belum beli ditandai "Belum Beli"', nb.length === 1 && nb[0].textContent.includes('Belum Beli'), nb[0]?.textContent?.slice(0, 120));
  AdminPage.userSearchQuery = '';
}

// --- Synthetic purchase (no server write): UI must react to a new purchase ---
if (sampleNonBuyer) {
  const synthetic = {
    ...data,
    investments: [
      ...(data.investments || []),
      { id: 'inv-harness-test', userId: sampleNonBuyer.id, planId: 'plan-learn', planName: 'Ai Trading 01', capital: 100000, status: 'active' }
    ]
  };
  AdminPage.userFilter = 'all';
  AdminPage.userSearchQuery = '';
  AdminPage.renderUsers(synthetic);
  check('Pembelian baru menaikkan counter Sudah Beli', Number(txt('userCountBuyers')) === expectedBuyers.length + 1, txt('userCountBuyers'));
  AdminPage.userSearchQuery = sampleNonBuyer.username;
  AdminPage.renderUsers(synthetic);
  const boughtRow = rows()[0]?.textContent || '';
  check('Member yang baru beli tampil dengan nama paket', boughtRow.includes('Ai Trading 01') && boughtRow.includes('Modal'), boughtRow.slice(0, 140));
  AdminPage.userSearchQuery = '';

  const finished = {
    ...data,
    investments: synthetic.investments.map(i => i.id === 'inv-harness-test' ? { ...i, status: 'completed' } : i)
  };
  AdminPage.userFilter = 'buyers';
  AdminPage.userSearchQuery = sampleNonBuyer.username;
  AdminPage.renderUsers(finished);
  const finishedRow = rows()[0]?.textContent || '';
  check('Paket selesai tetap terhitung sudah beli', finishedRow.includes('Selesai'), finishedRow.slice(0, 140));
  AdminPage.userSearchQuery = '';
}

AdminPage.userFilter = 'all';
AdminPage.renderUsers(data);
DB.get = originalGet;

// --- Changelog note ----------------------------------------------------------
const htmlNow = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
check('admin.html punya catatan log 2026-10-20', htmlNow.includes('2026-10-20') && htmlNow.includes('Sudah Beli'));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
