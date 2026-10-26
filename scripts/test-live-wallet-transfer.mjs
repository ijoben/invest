// LIVE wallet P2P transfer verification (real production code path).
//
// Runs the actual client modules (js/db.js + js/affiliate.js) against
// https://autotrading.my.id so the test exercises exactly what a member's
// browser executes: Affiliate.transferToMember() mutating synced state and
// persisting via DB.save().
//
// Scenario (the user's complaint): saldo Rp 500.000, transfer Rp 250.000 to a
// friend -> sender must be left with exactly Rp 250.000 and the recipient
// credited Rp 250.000, with matching debit/credit transactions.
// Negative cases: over-balance, below minimum, self-transfer, unknown target.

import { JSDOM } from 'jsdom';

const API = 'https://autotrading.my.id/api/index.php';

// --- environment shims (window origin drives DB.getApiUrl to the live host) --
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://autotrading.my.id/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.navigator = dom.window.navigator;
// NOTE: globalThis.fetch stays REAL — every call here hits production.

const { DB } = await import('../js/db.js');
const { Affiliate } = await import('../js/affiliate.js');

let pass = 0, fail = 0;
function check(label, ok, extra = '') {
  if (ok) { pass++; console.log('  OK   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra ? '  <' + extra + '>' : '')); }
}

async function rawPost(action, body, token = '') {
  const url = `${API}?action=${action}${token ? `&sessionToken=${encodeURIComponent(token)}` : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function adminGet(token) {
  const res = await fetch(`${API}?action=get&sessionToken=${encodeURIComponent(token)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const j = await res.json();
  if (!j.success || !j.data) throw new Error('admin GET failed: ' + JSON.stringify(j).slice(0, 200));
  return j.data;
}

const ts = Date.now().toString().slice(-5);
const senderName = `wlt_s${ts}`;
const recipName = `wlt_r${ts}`;
let adminToken = '';
let sender, recip;
let senderStart = 500000;

try {
  console.log('================================================================');
  console.log('LIVE WALLET P2P TRANSFER TEST — 500.000 kirim 250.000 -> sisa 250.000');
  console.log('================================================================\n');

  // --- 1. Register two fresh test members ------------------------------------
  console.log('1. Register test members...');
  const regS = await rawPost('register', {
    username: senderName, fullName: 'Wallet Tester S', email: `${senderName}@autotrading.my.id`,
    phone: '0821' + Math.floor(10000000 + Math.random() * 90000000), password: 'WalletTest123!'
  });
  if (!regS.success) throw new Error('register sender failed: ' + JSON.stringify(regS));
  sender = regS.user;

  const regR = await rawPost('register', {
    username: recipName, fullName: 'Wallet Tester R', email: `${recipName}@autotrading.my.id`,
    phone: '0822' + Math.floor(10000000 + Math.random() * 90000000), password: 'WalletTest123!'
  });
  if (!regR.success) throw new Error('register recipient failed: ' + JSON.stringify(regR));
  recip = regR.user;
  console.log(`   sender=${sender.id}/${senderName}  recipient=${recip.id}/${recipName}`);

  // --- 2. Admin session + fund sender with Rp 500.000 ------------------------
  const adm = await rawPost('login', { identifier: 'admin', password: 'admin' });
  if (!adm.success || !adm.sessionToken) throw new Error('admin login failed');
  adminToken = adm.sessionToken;

  let db = await adminGet(adminToken);
  const sRow = db.users.find(u => u.id === sender.id);
  const rRow = db.users.find(u => u.id === recip.id);
  if (!sRow || !rRow) throw new Error('test users not visible to admin');
  sRow.walletBalance = senderStart; // 500.000
  await rawPost('save', db, adminToken);
  console.log(`   sender funded: Rp ${senderStart.toLocaleString('id-ID')}`);

  // --- 3. Member session (sender) — real client module path ------------------
  const loginS = await rawPost('login', { identifier: senderName, password: 'WalletTest123!' });
  if (!loginS.success || !loginS.sessionToken) throw new Error('sender login failed: ' + JSON.stringify(loginS));
  localStorage.setItem('autotrading_session_token', loginS.sessionToken);

  await DB.syncFromCloud();
  const me = (DB.get().users || []).find(u => u.id === sender.id);
  check('sender hydrated with 500.000 via sync', !!me && me.walletBalance === senderStart, `got ${me && me.walletBalance}`);

  // --- 4. THE scenario: transfer 250.000 to friend ---------------------------
  console.log('\n2. Transfer Rp 250.000 ke member tujuan...');
  const res = await Affiliate.transferToMember(sender.id, recipName, 250000);
  check('transfer reports success', res && res.success === true, JSON.stringify(res));

  db = await adminGet(adminToken);
  const sAfter = db.users.find(u => u.id === sender.id).walletBalance;
  const rAfter = db.users.find(u => u.id === recip.id).walletBalance;
  check('sender saldo 500.000 - 250.000 = 250.000', sAfter === 250000, `got ${sAfter}`);
  check('recipient saldo 0 + 250.000 = 250.000', rAfter === 250000, `got ${rAfter}`);

  const trxOut = (db.transactions || []).find(t => t.userId === sender.id && t.type === 'member_transfer_out' && t.amount === 250000);
  const trxIn = (db.transactions || []).find(t => t.userId === recip.id && t.type === 'member_transfer' && t.amount === 250000);
  check('debit trx member_transfer_out tersimpan', !!trxOut);
  check('kredit trx member_transfer tersimpan', !!trxIn);

  // --- 5. Negative cases (state must not change) -----------------------------
  console.log('\n3. Negative cases...');
  const before = { s: db.users.find(u => u.id === sender.id).walletBalance, r: db.users.find(u => u.id === recip.id).walletBalance };

  const over = await Affiliate.transferToMember(sender.id, recipName, 300000); // sisa hanya 250.000
  check('transfer melebihi saldo DITOLAK', over && over.success === false && /mencukupi/i.test(over.message || ''), JSON.stringify(over));

  const tiny = await Affiliate.transferToMember(sender.id, recipName, 5000);
  check('transfer < Rp 10.000 DITOLAK', tiny && tiny.success === false && /Minimal/i.test(tiny.message || ''), JSON.stringify(tiny));

  const self = await Affiliate.transferToMember(sender.id, senderName, 10000);
  check('transfer ke diri sendiri DITOLAK', self && self.success === false, JSON.stringify(self));

  const ghost = await Affiliate.transferToMember(sender.id, 'tidak_ada_user_xyz', 10000);
  check('transfer ke user tak dikenal DITOLAK', ghost && ghost.success === false, JSON.stringify(ghost));

  await DB.syncFromCloud();
  const db2 = await adminGet(adminToken);
  const sFinal = db2.users.find(u => u.id === sender.id).walletBalance;
  const rFinal = db2.users.find(u => u.id === recip.id).walletBalance;
  check('saldo TIDAK berubah setelah semua penolakan', sFinal === before.s && rFinal === before.r, `s=${sFinal} r=${rFinal}`);

  // --- 6. Transfer sisa 250.000 -> saldo 0 (arithmetic penuh) ---------------
  console.log('\n4. Transfer sisa Rp 250.000 -> saldo nol...');
  await DB.syncFromCloud();
  const res2 = await Affiliate.transferToMember(sender.id, recipName, 250000);
  check('transfer sisa success', res2 && res2.success === true, JSON.stringify(res2));
  const db3 = await adminGet(adminToken);
  check('sender saldo = 0 setelah kirim seluruhnya', db3.users.find(u => u.id === sender.id).walletBalance === 0);
  check('recipient saldo = 500.000 (2x transfer)', db3.users.find(u => u.id === recip.id).walletBalance === 500000);

  console.log('\n================================================================');
  console.log(`RESULT: ${pass} OK / ${fail} FAIL`);
  console.log('================================================================');
} catch (e) {
  console.error('HARNESS ERROR:', e && e.message);
  fail++;
} finally {
  // --- Cleanup ---------------------------------------------------------------
  try {
    if (adminToken) {
      for (const uid of [sender?.id, recip?.id].filter(Boolean)) {
        const del = await rawPost('delete_user', { userId: uid }, adminToken);
        console.log(`cleanup delete_user ${uid}: ${del.success ? 'ok' : JSON.stringify(del)}`);
      }
      const clean = await adminGet(adminToken);
      const ids = [sender?.id, recip?.id].filter(Boolean);
      const before = clean.transactions.length;
      clean.transactions = (clean.transactions || []).filter(t => !ids.includes(t.userId));
      clean.users = (clean.users || []).filter(u => !ids.includes(u.id));
      await rawPost('save', clean, adminToken);
      console.log(`cleanup: removed ${before - clean.transactions.length} test transactions`);
    }
  } catch (e) {
    console.error('cleanup warning:', e && e.message);
  }
  localStorage.removeItem('autotrading_session_token');
}

process.exit(fail === 0 ? 0 : 1);
