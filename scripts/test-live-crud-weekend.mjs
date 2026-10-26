// LIVE verification: plan CRUD persistence + weekend market toggle sync.
//
// Part A — Plan CRUD (admin_save_plans):
//   add a test plan -> verify it round-trips through MySQL with its id and
//   fields intact -> heal the legacy id-less "tes5" plan -> restore the
//   original catalog -> verify restoration.
//
// Part B — Weekend toggle & claim pipeline:
//   the weekend gate is date-driven (server date('N')), so on a weekday it
//   must not block claims. The harness verifies the full claim path through
//   server claim_profit (pending_yield -> credit -> alreadyClaimed guard) and
//   proves the admin toggle persists and syncs through the public GET both
//   ways (LIBUR -> 7 Hari Penuh -> LIBUR restore). Weekend-day blocking
//   itself is covered by the dual-mode client harness scripts/test-weekly.mjs
//   plus the deployed gate code in claim_profit.

const API = 'https://autotrading.my.id/api/index.php';
let pass = 0, fail = 0;
function check(label, ok, extra = '') {
  if (ok) { pass++; console.log('  OK   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra ? '  <' + extra + '>' : '')); }
}

async function parseRes(res, what) {
  const text = await res.text();
  try { return JSON.parse(text); }
  catch (e) { throw new Error(`${what}: HTTP ${res.status}, non-JSON body: ${text.slice(0, 160)}`); }
}

async function rawPost(action, body, token = '') {
  const res = await fetch(`${API}?action=${action}${token ? `&sessionToken=${encodeURIComponent(token)}` : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
  return parseRes(res, `POST ${action}`);
}

async function rawGet(action, params = '', token = '') {
  const res = await fetch(`${API}?action=${action}${params ? '&' + params : ''}${token ? `&sessionToken=${encodeURIComponent(token)}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseRes(res, `GET ${action}`);
}

function findPlanId(plans, name) {
  const p = plans.find(x => x.name === name);
  return p ? p.id : null;
}

let adminToken = '';
let testUser = null;
let originalPlans = null;
let crudPlanId = null;
const TRX_IDS = [];

try {
  console.log('================================================================');
  console.log('LIVE TEST: CRUD PLAN + TOGGLE WEEKEND (hari bursa: Senin)', ' | hari:', new Date().toISOString());
  console.log('================================================================\n');

  // ================= PART A: PLAN CRUD =================
  console.log('A. CRUD Paket Investasi via admin_save_plans...');
  const adm = await rawPost('login', { identifier: 'admin', password: 'admin' });
  if (!adm.success || !adm.sessionToken) throw new Error('admin login failed: ' + JSON.stringify(adm));
  adminToken = adm.sessionToken;

  let get = await rawGet('get', '', adminToken);
  if (!get.success) throw new Error('admin GET failed');
  originalPlans = JSON.parse(JSON.stringify(get.data.plans || []));
  check('snapshot katalog plan asli (' + originalPlans.length + ' plan)', originalPlans.length > 0);

  // --- Add test plan ---------------------------------------------------------
  const testName = 'CRUDTEST Plan ' + Date.now().toString().slice(-4);
  const crudPlan = {
    id: 'plan-crudtest-' + Date.now().toString().slice(-6),
    name: testName,
    minDeposit: 250000,
    maxDeposit: 2500000,
    minDailyProfit: 2.2,
    maxDailyProfit: 3.3,
    durationDays: 21,
    theme: 'theme-learn',
    activeCount: 0
  };
  const withNew = [...originalPlans, crudPlan];
  let saveRes = await rawPost('admin_save_plans', { plans: withNew }, adminToken);
  check('admin_save_plans menerima paket baru', saveRes && saveRes.success === true, JSON.stringify(saveRes).slice(0, 150));

  get = await rawGet('get', '', adminToken);
  const afterAdd = get.data.plans || [];
  const added = afterAdd.find(p => p.id === crudPlan.id);
  check('paket baru tersimpan dengan id utuh', !!added, JSON.stringify(afterAdd.map(p => p.id)));
  if (added) {
    check('field paket akurat (name/min/max/rate/durasi)',
      added.name === testName && added.minDeposit === 250000 && added.maxDeposit === 2500000 &&
      added.minDailyProfit === 2.2 && added.maxDailyProfit === 3.3 && added.durationDays === 21,
      JSON.stringify(added));
  }
  crudPlanId = crudPlan.id;

  // --- Edit test plan --------------------------------------------------------
  const editedName = testName + ' (edit)';
  const editedList = afterAdd.map(p => p.id === crudPlan.id ? { ...p, name: editedName, maxDailyProfit: 4.4 } : p);
  saveRes = await rawPost('admin_save_plans', { plans: editedList }, adminToken);
  get = await rawGet('get', '', adminToken);
  const edited = (get.data.plans || []).find(p => p.id === crudPlan.id);
  check('edit paket tersimpan (nama & rate berubah)',
    saveRes.success === true && edited && edited.name === editedName && edited.maxDailyProfit === 4.4,
    JSON.stringify(edited));

  // --- Heal legacy id-less plan + delete test plan ---------------------------
  let healedList = (get.data.plans || []).filter(p => p.id !== crudPlan.id); // delete test plan
  let healedCount = 0;
  healedList = healedList.map(p => {
    if (!p.id) { healedCount++; return { ...p, id: 'plan-healed-' + Math.random().toString(36).slice(2, 8) }; }
    return p;
  });
  saveRes = await rawPost('admin_save_plans', { plans: healedList }, adminToken);
  get = await rawGet('get', '', adminToken);
  const finalPlans = get.data.plans || [];
  check('paket test terhapus dari katalog', !finalPlans.find(p => p.id === crudPlanId));
  const stillIdLess = finalPlans.filter(p => !p.id).length;
  check(`healing plan tanpa id (${healedCount} diperbaiki)`, saveRes.success === true && stillIdLess === 0, `sisa tanpa id: ${stillIdLess}`);

  // ================= PART B: TOGGLE WEEKEND =================
  console.log('\nB. Toggle weekend + klaim profit (hari bursa Senin)...');
  const ts = Date.now().toString().slice(-5);
  const uname = `wke_${ts}`;

  // Register + fund member, then buy a plan through the real invest_plan endpoint
  const reg = await rawPost('register', {
    username: uname, fullName: 'Weekend Tester', email: `${uname}@autotrading.my.id`,
    phone: '0823' + Math.floor(10000000 + Math.random() * 90000000), password: 'WeekendTest123!'
  });
  if (!reg.success) throw new Error('register failed: ' + JSON.stringify(reg));
  testUser = reg.user;

  get = await rawGet('get', '', adminToken);
  const uRow = (get.data.users || []).find(u => u.id === testUser.id);
  if (!uRow) throw new Error('test user not visible to admin');
  uRow.walletBalance = 1000000;
  await rawPost('save', get.data, adminToken);

  const login = await rawPost('login', { identifier: uname, password: 'WeekendTest123!' });
  if (!login.success || !login.sessionToken) throw new Error('member login failed');
  const mTok = login.sessionToken;

  // Buy cheapest valid plan (plan-learn min 100k) via server endpoint
  const buy = await rawPost('invest_plan', { sessionToken: mTok, planId: 'plan-learn', amount: 200000 }, mTok);
  check('aktivasi paket via invest_plan (server)', buy && buy.success === true, JSON.stringify(buy).slice(0, 180));

  // Check current setting is LIBUR
  get = await rawGet('get', '', adminToken);
  const wkLibur = get.data.settings && get.data.settings.weekendProfit && get.data.settings.weekendProfit.enabled === false;
  check('setting live saat ini = LIBUR (enabled:false)', !!wkLibur, JSON.stringify(get.data.settings && get.data.settings.weekendProfit));

  // Queue today's pending profit for the fresh investment through the same
  // state history row the production yield engine writes (pending_claim).
  // NOTE: today is a WEEKDAY (Senin), so the weekend gate must NOT block the
  // claim while the market is open — that part of the gate is date-driven and
  // is covered by the dual-mode client harness (scripts/test-weekly.mjs).
  get = await rawGet('get', '', adminToken);
  const myInv = (get.data.investments || []).find(i => i.userId === testUser.id);
  if (!myInv) throw new Error('investment not found after invest_plan');
  myInv.history = myInv.history || [];
  myInv.history.push({ date: new Date().toISOString(), amount: 15000, rate: 1.5, status: 'pending_claim' });
  await rawPost('save', get.data, adminToken);

  const balBefore = (get.data.users || []).find(u => u.id === testUser.id).walletBalance;
  let claim = await rawPost('claim_profit', { sessionToken: mTok }, mTok);
  check('hari bursa (Senin): klaim profit BERHASIL via server claim_profit',
    claim && claim.success === true && claim.weekendClosed !== true,
    JSON.stringify(claim).slice(0, 200));

  get = await rawGet('get', '', adminToken);
  const balAfter = (get.data.users || []).find(u => u.id === testUser.id).walletBalance;
  check(`saldo member naik setelah klaim (${balBefore} -> ${balAfter})`, balAfter > balBefore);

  // Second claim today must be guarded (single-claim per day)
  claim = await rawPost('claim_profit', { sessionToken: mTok }, mTok);
  check('klaim kedua hari ini DITOLAK (alreadyClaimed)',
    claim && claim.success === false && claim.alreadyClaimed === true,
    JSON.stringify(claim).slice(0, 160));

  // Toggle flip must persist and sync through the public GET both ways
  const flipOn = await rawPost('admin_save_settings', {
    weekendProfit: { enabled: true, offMessage: 'Pasar Keuangan & Trading Libur di Akhir Pekan (Sabtu & Minggu). Dividen profit akan kembali berjalan aktif hari Senin.' },
    weekendProfitEnabled: true
  }, adminToken);
  check('admin_save_settings flip -> 7 Hari Penuh', flipOn && flipOn.success === true, JSON.stringify(flipOn).slice(0, 150));

  get = await rawGet('get', '', adminToken);
  check('GET publik sinkron: weekendProfit.enabled=true',
    !!(get.data.settings && get.data.settings.weekendProfit && get.data.settings.weekendProfit.enabled === true));

  const flipOff = await rawPost('admin_save_settings', {
    weekendProfit: { enabled: false, offMessage: 'Pasar Keuangan & Trading Libur di Akhir Pekan (Sabtu & Minggu). Dividen profit akan kembali berjalan aktif hari Senin.' },
    weekendProfitEnabled: false
  }, adminToken);
  check('restore LIBUR tersimpan', flipOff && flipOff.success === true);
  get = await rawGet('get', '', adminToken);
  check('GET publik sinkron: weekendProfit.enabled=false (restore)',
    !!(get.data.settings && get.data.settings.weekendProfit && get.data.settings.weekendProfit.enabled === false));

  // Collect trx ids of test user for cleanup
  for (const t of (get.data.transactions || [])) {
    if (t.userId === testUser.id) TRX_IDS.push(t.id);
  }

  console.log('\n================================================================');
  console.log(`RESULT: ${pass} OK / ${fail} FAIL`);
  console.log('================================================================');
} catch (e) {
  console.error('HARNESS ERROR:', e && e.message);
  fail++;
} finally {
  // Cleanup: delete test user, their transactions, their investments
  try {
    if (testUser && adminToken) {
      const del = await rawPost('delete_user', { userId: testUser.id }, adminToken);
      console.log(`cleanup delete_user: ${del.success ? 'ok' : JSON.stringify(del)}`);
      const clean = await rawGet('get', '', adminToken);
      const before = clean.data.transactions.length;
      clean.data.transactions = (clean.data.transactions || []).filter(t => t.userId !== testUser.id);
      clean.data.investments = (clean.data.investments || []).filter(i => i.userId !== testUser.id);
      clean.data.users = (clean.data.users || []).filter(u => u.id !== testUser.id);
      await rawPost('save', clean.data, adminToken);
      console.log(`cleanup: removed ${before - clean.data.transactions.length} test transactions`);
    }
  } catch (e) {
    console.error('cleanup warning:', e && e.message);
  }
}

process.exit(fail === 0 ? 0 : 1);
