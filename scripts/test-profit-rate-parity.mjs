// PARITY TEST: rumus rate profit harian PHP vs JS.
//
// Nominal profit yang dikreditkan server harus selalu sama dengan modal x rate
// yang ditampilkan di dashboard member. Itu hanya mungkin bila implementasi
// deterministicProfitRate() (api/index.php) dan getDeterministicDailyRate()
// (js/plans.js) menghasilkan angka yang PERSIS sama untuk input yang sama.
//
// Tes ini mengekstrak fungsi PHP langsung dari api/index.php (bukan salinan),
// menjalankannya lewat PHP CLI, lalu membandingkan hasilnya dengan js/plans.js
// untuk ratusan kombinasi id paket, rentang rate, dan tanggal.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
function check(label, ok, extra = '') {
  if (ok) { pass++; console.log('  OK   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra ? '  <' + extra + '>' : '')); }
}

// --- 1. Ambil fungsi PHP asli dari source ----------------------------------
const phpSource = fs.readFileSync(path.join(root, 'api', 'index.php'), 'utf8');
const fnMatch = phpSource.match(/function deterministicProfitRate\([^)]*\)\s*\{[\s\S]*?\n\}/);
if (!fnMatch) {
  console.error('Fungsi deterministicProfitRate tidak ditemukan di api/index.php');
  process.exit(1);
}
check('deterministicProfitRate() ada di api/index.php', true);

// --- 2. Siapkan lingkungan JS (jsdom) lalu import Plans --------------------
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://autotrading.my.id/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.navigator = dom.window.navigator;

const { Plans } = await import(pathToFileURL(path.join(root, 'js', 'plans.js')).href);

// --- 3. Bangun daftar kasus uji -------------------------------------------
const invIds = [
  'inv-1791445218883',
  'inv-1792376327488',
  'inv-1700000000001',
  'plan-learn-inv-1',
  'x'
];
const ranges = [
  [1.5, 2.4],
  [0.4, 0.7],
  [0.1, 0.3],
  [2, 2],
  [1, 1.85]
];
const dates = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'];

const cases = [];
for (const id of invIds) {
  for (const [min, max] of ranges) {
    for (const d of dates) cases.push({ id, min, max, date: d });
  }
}

// --- 4. Jalankan versi PHP --------------------------------------------------
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

const tmpFile = path.join(os.tmpdir(), 'profit-rate-parity-' + process.pid + '.php');
const phpScript = `<?php
${fnMatch[0]}
$cases = json_decode(file_get_contents($argv[1]), true);
$out = [];
foreach ($cases as $c) {
    $out[] = deterministicProfitRate($c['id'], $c['min'], $c['max'], $c['date']);
}
echo json_encode($out);
`;
const casesFile = path.join(os.tmpdir(), 'profit-rate-cases-' + process.pid + '.json');
fs.writeFileSync(tmpFile, phpScript);
fs.writeFileSync(casesFile, JSON.stringify(cases));

let phpRates = [];
try {
  // -n = abaikan php.ini (hindari warning ekstensi openssl yang tidak dibutuhkan)
  const raw = execFileSync(phpBin, ['-n', tmpFile, casesFile], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  phpRates = JSON.parse(String(raw).trim());
} finally {
  try { fs.unlinkSync(tmpFile); } catch (e) {}
  try { fs.unlinkSync(casesFile); } catch (e) {}
}

check('PHP mengembalikan jumlah rate yang sama', phpRates.length === cases.length, `${phpRates.length} vs ${cases.length}`);

// --- 5. Bandingkan dengan JS ------------------------------------------------
let mismatches = [];
cases.forEach((c, i) => {
  const jsRate = Plans.getDeterministicDailyRate({ id: c.id, minRate: c.min, maxRate: c.max }, c.date);
  if (Math.abs(jsRate - phpRates[i]) > 1e-9) {
    mismatches.push(`${c.id} ${c.min}-${c.max} ${c.date}: php=${phpRates[i]} js=${jsRate}`);
  }
});
check(`rate PHP == rate JS untuk ${cases.length} kombinasi`, mismatches.length === 0, mismatches.slice(0, 3).join(' | '));

// --- 6. Nominal = modal x rate (basis point) -------------------------------
let amountMismatch = 0;
for (const capital of [100000, 250000, 1000000, 2500000, 55000000]) {
  for (const c of cases.slice(0, 60)) {
    const rate = Plans.getDeterministicDailyRate({ id: c.id, minRate: c.min, maxRate: c.max }, c.date);
    const jsAmount = Plans.computeProfitAmount(capital, rate);
    // Rumus server: floor(capital * round(rate*100) / 10000)
    const phpAmount = Math.floor(capital * Math.round(rate * 100) / 10000);
    if (jsAmount !== phpAmount) amountMismatch++;
  }
}
check('nominal profit klien == rumus basis point server', amountMismatch === 0, String(amountMismatch));

// --- 7. Rate konstan untuk input sama (tidak random) -----------------------
const a = Plans.getDeterministicDailyRate({ id: 'inv-1791445218883', minRate: 1.5, maxRate: 2.4 }, '2026-10-23');
const b = Plans.getDeterministicDailyRate({ id: 'inv-1791445218883', minRate: 1.5, maxRate: 2.4 }, '2026-10-23');
check('rate deterministik (dua pemanggilan identik)', a === b, `${a} vs ${b}`);
check('rate berada di dalam rentang paket', a >= 1.5 && a <= 2.4, String(a));

// --- 8. Rate sesuai modal -> persen yang ditampilkan ----------------------
const capital = 2500000;
const rate = 2.37;
const amt = Plans.computeProfitAmount(capital, rate);
const back = Plans.impliedRateFromAmount(amt, capital);
check('impliedRateFromAmount membalikkan rate dengan benar', Math.abs(back - rate) <= 0.01, `${back} vs ${rate}`);

console.log(`\n===== HASIL: ${pass} PASS, ${fail} FAIL =====`);
process.exit(fail === 0 ? 0 : 1);
