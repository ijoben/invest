const { DB } = await import('../js/db.js');
const { Plans } = await import('../js/plans.js');

console.log('===================================================');
console.log('TESTING WEEKLY PROFIT — DUAL WEEKEND TOGGLE MODE');
console.log('===================================================');

// --- Fixture: a member with an active investment package -------------------
// Guests and members without a package legitimately return an empty/label-only
// breakdown, so the weekly spec can only be verified with an active member.
const db = DB.get();

db.users = db.users || [];
db.investments = db.investments || [];

const fixtureUserId = 'usr-weekly-test';
if (!db.users.some(u => u.id === fixtureUserId)) {
  db.users.push({
    id: fixtureUserId,
    username: 'weekly_tester',
    fullName: 'Weekly Tester',
    email: 'weekly@test.local',
    walletBalance: 1000000,
    affiliateBalance: 0,
    points: 10,
    role: 'user',
    status: 'active',
    isBlocked: false,
    registeredAt: new Date(Date.now() - 30 * 86400000).toISOString()
  });
}
if (!db.investments.some(i => i.id === 'inv-weekly-test')) {
  db.investments.push({
    id: 'inv-weekly-test',
    userId: fixtureUserId,
    planId: 'plan-standard',
    planName: 'Standard Plan',
    capital: 1000000,
    minRate: 1.0,
    maxRate: 1.5,
    minDailyProfit: 1.0,
    maxDailyProfit: 1.5,
    status: 'active',
    daysElapsed: 5,
    durationDays: 30,
    totalProfitEarned: 60000,
    pendingProfitClaim: 12000,
    startDate: new Date(Date.now() - 10 * 86400000).toISOString(),
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString()
  });
}

function setWeekendMode(enabled) {
  const d = DB.get();
  d.settings.weekendProfit = {
    enabled,
    offMessage: 'Pasar Keuangan & Trading Libur di Akhir Pekan (Sabtu & Minggu). Dividen profit akan kembali berjalan aktif hari Senin.'
  };
  d.settings.weekendProfitEnabled = enabled;
}

let totalFailures = 0;

function runPass(label, weekendEnabled) {
  console.log('\n---------------------------------------------');
  console.log(`MODE: ${label}`);
  setWeekendMode(weekendEnabled);

  const res = Plans.getWeeklyProfitHistory(fixtureUserId) || {};
  const records = Array.isArray(res.records) ? res.records : [];
  const totalRate = Number(res.totalRate || 0);
  const avgRate = Number(res.avgRate || 0);
  let failures = 0;

  console.log(`Weekly Total: +${totalRate.toFixed(2)}% | Weekly Avg: +${avgRate.toFixed(2)}% / hari`);
  console.log(`Active Days Count: ${Number(res.countActiveDays || 0)}`);

  records.forEach((r, idx) => {
    console.log(`[${idx}] ${String(r.dayName).padEnd(7)} (${r.date}): Rate=${String(r.displayRate).padEnd(8)} | Pill=${String(r.pillText).padEnd(12)} | Weekend=${!!r.isWeekend} | Future=${!!r.isFuture}`);
  });

  if (records.length !== 7) {
    console.error(`[FAIL] Expected 7 day records (Senin-Minggu), got ${records.length}`);
    failures++;
  }

  records.forEach((r, idx) => {
    const isCalendarWeekend = idx >= 5; // Senin-Jumat = idx 0-4
    const marketOpenDay = !isCalendarWeekend || weekendEnabled;

    if (isCalendarWeekend && !weekendEnabled) {
      // LIBUR mode: Sabtu & Minggu must be Pasar OFF with no rate
      if (!r.isOff || r.pillText !== 'Pasar OFF') {
        console.error(`[FAIL] LIBUR mode: ${r.dayName} should be Pasar OFF! got: pill=${r.pillText}, isOff=${r.isOff}`);
        failures++;
      }
      if (r.displayRate !== '-') {
        console.error(`[FAIL] LIBUR mode: ${r.dayName} must not show a profit rate, got: ${r.displayRate}`);
        failures++;
      }
      return;
    }

    if (marketOpenDay) {
      // Trading day (weekday, or weekend when "7 Hari Penuh Aktif").
      // isWeekend stays a calendar fact; isOff must be false (market open).
      if (r.isOff) {
        console.error(`[FAIL] ${label}: trading day ${r.dayName} must not be flagged market-off (isOff)`);
        failures++;
      }
      if (r.isFuture) {
        if (r.displayRate !== '-') {
          console.error(`[FAIL] ${label}: future day ${r.dayName} must not show profit rate yet! got: ${r.displayRate}`);
          failures++;
        }
        if (r.pillText !== 'Next') {
          console.error(`[FAIL] ${label}: future day ${r.dayName} must have Next pill! got: ${r.pillText}`);
          failures++;
        }
      } else {
        if (!r.displayRate || !r.displayRate.includes('%')) {
          console.error(`[FAIL] ${label}: day ${r.dayName} does not display percentage rate! got: ${r.displayRate}`);
          failures++;
        }
        if (!r.pillText || String(r.pillText).trim() === '') {
          console.error(`[FAIL] ${label}: day ${r.dayName} is missing its status pill text`);
          failures++;
        }
      }
    }
  });

  // Consistency: totals must be the sum of the days the market is open
  if (!Number.isFinite(totalRate) || !Number.isFinite(avgRate)) {
    console.error(`[FAIL] totalRate/avgRate must be finite numbers, got: ${res.totalRate}/${res.avgRate}`);
    failures++;
  }
  const openRates = records
    .filter(r => !r.isOff && typeof r.rate === 'number')
    .map(r => r.rate);
  const recomputedTotal = openRates.reduce((a, b) => a + b, 0);
  if (Math.abs(recomputedTotal - totalRate) > 0.05) {
    console.error(`[FAIL] totalRate ${totalRate} does not match sum of open-market rates ${recomputedTotal.toFixed(2)}`);
    failures++;
  }
  const expectedActiveDays = weekendEnabled ? 7 : 5;
  if (Number(res.countActiveDays || 0) !== expectedActiveDays) {
    console.error(`[FAIL] countActiveDays should be ${expectedActiveDays} in ${label} mode, got ${res.countActiveDays}`);
    failures++;
  }

  // Cross-check the toggle accessor used by app.js status pill
  if (Plans.isWeekendProfitEnabled() !== weekendEnabled) {
    console.error(`[FAIL] Plans.isWeekendProfitEnabled() should return ${weekendEnabled}`);
    failures++;
  }

  console.log(failures === 0 ? `[PASS] MODE ${label}: all checks OK` : `[FAIL] MODE ${label}: ${failures} issue(s)`);
  totalFailures += failures;
  return failures;
}

runPass('LIBUR (Senin-Jumat Saja)', false);
runPass('7 HARI PENUH AKTIF', true);

// Guest view must return an empty/label-only breakdown in both modes (never crash)
for (const mode of [false, true]) {
  setWeekendMode(mode);
  const guestRes = Plans.getWeeklyProfitHistory(null) || {};
  if (!Array.isArray(guestRes.records)) {
    console.error('[FAIL] Guest weekly history must still return a records array');
    totalFailures++;
  } else {
    const guestWeekday = guestRes.records.slice(0, 5)[0];
    if (guestWeekday && guestWeekday.displayRate !== '-' && guestWeekday.isGuest) {
      console.error(`[FAIL] Guest weekday must not expose a profit rate, got: ${guestWeekday.displayRate}`);
      totalFailures++;
    }
    if (guestRes.records.length !== 7) {
      console.error(`[FAIL] Guest weekly history should have 7 records, got: ${guestRes.records.length}`);
      totalFailures++;
    }
  }
}

// Restore default mode so other harnesses importing this fixture stay predictable
setWeekendMode(false);

console.log('\n---------------------------------------------');
if (totalFailures === 0) {
  console.log('[ALL CHECKS PASSED] Weekly profit breakdown follows the admin weekend toggle in DB, admin UI, and frontend!');
} else {
  console.error(`[TEST FAILED] ${totalFailures} issues detected!`);
  process.exit(1);
}
