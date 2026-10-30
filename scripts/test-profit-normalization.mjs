// VERIFIKASI NORMALISASI PROFIT
//
// Memastikan mesin profit baru (buildYieldDateList/buildCanonicalYieldRows di
// api/index.php) hanya membayar hari yang menjadi hak paket, nominal per hari
// selalu di dalam rentang paket, dan daftar tanggalnya sama persis dengan
// Plans.getYieldDates() di browser.
//
// Kasus utama: widybiz, modal Rp 100.000, paket 1,5%-2,4%, weekend OFF.
// 4 klaim pertama HARUS bernilai total Rp 6.800 (4 x 1,7%), bukan Rp 17.120
// seperti bug lama yang membayar ulang hari-hari sebelumnya.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) { pass++; console.log('  OK   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra ? '  <' + extra + '>' : '')); }
};

const phpSource = fs.readFileSync(path.join(root, 'api', 'index.php'), 'utf8');
const fnNames = [
  'deterministicProfitRate',
  'profitAmountFromRate',
  'normalizeHistoryDate',
  'buildYieldDateList',
  'buildCanonicalYieldRows'
];
const fnSources = fnNames.map((name) => {
  const re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}');
  const m = phpSource.match(re);
  if (!m) {
    console.error('Fungsi ' + name + ' tidak ditemukan di api/index.php');
    process.exit(1);
  }
  return m[0];
});
check('Semua fungsi profit kanonik ada di api/index.php', true);

function findPhp() {
  const candidates = [
    process.env.PHP_BIN,
    'php',
    'C:\\Program Files\\PHP\\v8.2\\php.exe',
    'C:\\xampp\\php\\php.exe'
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      execFileSync(c, ['-v'], { stdio: 'ignore' });
      return c;
    } catch (e) {}
  }
  return null;
}

const phpBin = findPhp();
if (!phpBin) {
  console.error('PHP CLI tidak ditemukan. Set PHP_BIN untuk menjalankan tes ini.');
  process.exit(2);
}

function runPhp(body, payload) {
  const tmp = path.join(os.tmpdir(), 'profit-normalize-' + process.pid + '.php');
  const dataFile = path.join(os.tmpdir(), 'profit-normalize-' + process.pid + '.json');
  fs.writeFileSync(tmp, '<?php\n' + fnSources.join('\n\n') + '\n' + body);
  fs.writeFileSync(dataFile, JSON.stringify(payload));
  try {
    const raw = execFileSync(phpBin, ['-n', tmp, dataFile], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(String(raw).trim());
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) {}
    try { fs.unlinkSync(dataFile); } catch (e) {}
  }
}

// --- 1. Tanggal kanonik widybiz (weekend OFF) ------------------------------
const widyRows = runPhp(`
$in = json_decode(file_get_contents($argv[1]), true);
echo json_encode(buildCanonicalYieldRows(
    $in['invId'], $in['capital'], $in['min'], $in['max'],
    $in['start'], $in['end'], $in['weekend'], $in['upto']
));
`, {
  invId: 'inv-1792676427093', capital: 100000, min: 1.5, max: 2.4,
  start: '2026-10-22', end: '2026-10-28', weekend: false, upto: 45
});

check('widybiz: hanya 5 hari bursa (22,23,26,27,28 Okt)', widyRows.length === 5, String(widyRows.length));
check('widybiz: hari pertama 2026-10-22', widyRows[0]?.date === '2026-10-22', widyRows[0]?.date);
check('widybiz: weekend 24/25 Okt tidak ikut', !widyRows.some(r => r.date === '2026-10-24' || r.date === '2026-10-25'));
check('widybiz: semua rate di 1,5%-2,4%', widyRows.every(r => r.rate >= 1.5 && r.rate <= 2.4), JSON.stringify(widyRows.map(r => r.rate)));
check('widybiz: semua nominal <= 2,4% modal', widyRows.every(r => r.amount <= 2400), JSON.stringify(widyRows.map(r => r.amount)));
const total4 = widyRows.slice(0, 4).reduce((s, r) => s + r.amount, 0);
check('widybiz: 4 klaim pertama = Rp 6.800 (bukan 17.120)', total4 === 6800, String(total4));
check('widybiz: hari ke-5 belum dibayar saat hari ke-4', widyRows.length === 5 && widyRows[4].date === '2026-10-28');

// --- 2. Weekend ON menyertakan Sabtu/Minggu --------------------------------
const weekendRows = runPhp(`
$in = json_decode(file_get_contents($argv[1]), true);
echo json_encode(buildYieldDateList($in['start'], $in['end'], $in['weekend'], 0));
`, { start: '2026-10-22', end: '2026-10-28', weekend: true });
check('Weekend ON: 22-28 Okt = 7 hari', weekendRows.length === 7, String(weekendRows.length));
check('Weekend ON: 24 & 25 Okt ikut', weekendRows.includes('2026-10-24') && weekendRows.includes('2026-10-25'));

// --- 3. Paritas daftar tanggal PHP vs JS ----------------------------------
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://autotrading.my.id/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.navigator = dom.window.navigator;

const { Plans } = await import(pathToFileURL(path.join(root, 'js', 'plans.js')).href);
Plans.isWeekendProfitEnabled = () => false;

for (const [start, end] of [['2026-10-22', '2026-10-28'], ['2026-10-01', '2026-10-31'], ['2026-01-01', '2026-03-31']]) {
  const jsDates = Plans.getYieldDates(start, end);
  const phpDates = runPhp(`
$in = json_decode(file_get_contents($argv[1]), true);
echo json_encode(buildYieldDateList($in['start'], $in['end'], false, 0));
`, { start, end });
  check(`Paritas tanggal PHP==JS (${start} s/d ${end})`, JSON.stringify(jsDates) === JSON.stringify(phpDates),
    `js=${jsDates.length} php=${phpDates.length}`);
}

// --- 4. Rate & nominal kanonik masih sama dengan rumus klien --------------
const sample = runPhp(`
$in = json_decode(file_get_contents($argv[1]), true);
echo json_encode(buildCanonicalYieldRows('inv-1792676427093', 2500000, 2, 3.5, '2026-10-01', '2026-10-29', false, 30));
`, {});
let mismatch = 0;
for (const row of sample) {
  const jsRate = Plans.getDeterministicDailyRate({ id: 'inv-1792676427093', minRate: 2, maxRate: 3.5 }, row.date);
  const jsAmount = Plans.computeProfitAmount(2500000, jsRate);
  if (Math.abs(jsRate - row.rate) > 1e-9 || jsAmount !== row.amount) mismatch++;
}
check('Nominal kanonik PHP == rumus klien', mismatch === 0, String(mismatch));
check('Semua rate kanonik dalam rentang 2%-3,5%', sample.every(r => r.rate >= 2 && r.rate <= 3.5));

console.log(`\n===== HASIL: ${pass} PASS, ${fail} FAIL =====`);
process.exit(fail === 0 ? 0 : 1);
