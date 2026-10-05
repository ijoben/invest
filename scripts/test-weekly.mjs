const { DB } = await import('../js/db.js');
const { Plans } = await import('../js/plans.js');

console.log('=============================================');
console.log('TESTING WEEKLY PROFIT HISTORY & STATUS PILLS');
console.log('=============================================');

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

const res = Plans.getWeeklyProfitHistory(fixtureUserId) || {};
const records = Array.isArray(res.records) ? res.records : [];
const totalRate = Number(res.totalRate || 0);
const avgRate = Number(res.avgRate || 0);

console.log(`Weekly Total: +${totalRate.toFixed(2)}% | Weekly Avg: +${avgRate.toFixed(2)}% / hari`);
console.log(`Active Days Count: ${Number(res.countActiveDays || 0)}`);
console.log('---------------------------------------------');

records.forEach((r, idx) => {
  const pillClass = String(r.pillClass || '-');
  console.log(`[${idx}] ${String(r.dayName).padEnd(7)} (${r.date}): Rate=${String(r.displayRate).padEnd(8)} | Pill=${String(r.pillText).padEnd(12)} | PillClass=${pillClass.padEnd(16)} | Today=${!!r.isToday} | Weekend=${!!r.isWeekend}`);
});

console.log('---------------------------------------------');

// Assertions
let failures = 0;

if (records.length !== 7) {
  console.error(`[FAIL] Expected 7 day records (Senin-Minggu), got ${records.length}`);
  failures++;
}

if (records.length === 7) {
  records.forEach((r, idx) => {
    if (idx < 5) {
      // Senin s/d Jumat must show a percentage rate for an active member
      if (!r.displayRate || !r.displayRate.includes('%')) {
        console.error(`[FAIL] Day ${r.dayName} does not display percentage rate! got: ${r.displayRate}`);
        failures++;
      }
      if (!r.pillText || String(r.pillText).trim() === '') {
        console.error(`[FAIL] Day ${r.dayName} is missing its status pill text`);
        failures++;
      }
      if (r.isWeekend) {
        console.error(`[FAIL] Weekday ${r.dayName} must not be flagged as weekend`);
        failures++;
      }
    } else {
      // Sabtu & Minggu
      if (!r.isWeekend || r.pillText !== 'Pasar OFF') {
        console.error(`[FAIL] Weekend day ${r.dayName} should be Pasar OFF! got: pill=${r.pillText}, isWeekend=${r.isWeekend}`);
        failures++;
      }
      if (r.displayRate !== '-') {
        console.error(`[FAIL] Weekend day ${r.dayName} must not show a profit rate, got: ${r.displayRate}`);
        failures++;
      }
    }
  });
}

// Consistency: countActiveDays + totals are finite and derived from the records
if (!Number.isFinite(totalRate) || !Number.isFinite(avgRate)) {
  console.error(`[FAIL] totalRate/avgRate must be finite numbers, got ${res.totalRate}/${res.avgRate}`);
  failures++;
}
const weekdayRates = records.slice(0, 5)
  .map(r => (typeof r.rate === 'number' ? r.rate : 0));
const recomputedTotal = weekdayRates.reduce((a, b) => a + b, 0);
if (Math.abs(recomputedTotal - totalRate) > 0.05) {
  console.error(`[FAIL] totalRate ${totalRate} does not match sum of weekday rates ${recomputedTotal.toFixed(2)}`);
  failures++;
}

// Guest view must return an empty/label-only breakdown (never crash)
const guestRes = Plans.getWeeklyProfitHistory(null) || {};
if (!Array.isArray(guestRes.records)) {
  console.error('[FAIL] Guest weekly history must still return a records array');
  failures++;
} else {
  const guestWeekday = guestRes.records.slice(0, 5)[0];
  if (guestWeekday && guestWeekday.displayRate !== '-' && guestWeekday.isGuest) {
    console.error(`[FAIL] Guest weekday must not expose a profit rate, got: ${guestWeekday.displayRate}`);
    failures++;
  }
  if (guestRes.records.length !== 7) {
    console.error(`[FAIL] Guest weekly history should have 7 records, got ${guestRes.records.length}`);
    failures++;
  }
}

if (failures === 0) {
  console.log('[ALL CHECKS PASSED] Weekly profit breakdown conforms 100% to user specification!');
} else {
  console.error(`[TEST FAILED] ${failures} issues detected!`);
  process.exit(1);
}
