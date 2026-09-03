/**
 * Regression check for the "メール・ダッシュボードの時刻不整合" incident
 * (2026-09): every date/time display in this app (dashboard alert
 * timestamps, Slack's daily-summary date, the CSV export's timestamp
 * column, the monthly report's date-range boundaries, the trend chart's
 * day-bucketing) was built with either `Intl.DateTimeFormat("ja-JP",
 * ...)` / `toLocaleString("ja-JP")` with no `timeZone` option, or a
 * plain `new Date(year, month, day)` / date-fns `format()` call - all
 * of which read the SERVER PROCESS's own local timezone, not Japan's.
 * On a developer's own machine (already set to JST) this masked itself
 * completely; on Vercel's serverless functions (UTC, no TZ env var)
 * every one of these was off by up to 9 hours, and around midnight
 * JST, by a full calendar day - the daily cron runs at 07:00-07:30 JST,
 * which is still the PREVIOUS day in UTC.
 *
 * This script forces TZ=UTC on itself (see the very first line) so it
 * fails the same way production did if lib/jst.ts's fix ever
 * regresses, regardless of what timezone the machine actually running
 * it happens to be in.
 *
 * Run with: npx tsx scripts/verify-jst-timezone-fix.ts
 * (or, to prove it isn't just passing because the runner is already
 * JST: TZ=UTC npx tsx scripts/verify-jst-timezone-fix.ts)
 */
process.env.TZ = "UTC";

import { formatJst, jstDateKey, formatJstIntl, jstMidnight, jstMidnightFromDateString } from "../lib/jst";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} - ${label}`);
  if (!ok) {
    console.log(`     expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failures++;
  }
}

// A daily-cron check at 07:23 JST on 2026-09-02, which is 22:23 UTC on
// the PREVIOUS day, 2026-09-01 - the exact shape of every single row
// the daily cron has ever written.
const cronCheckTime = new Date("2026-09-01T22:23:00.000Z");

check("formatJst shows the JST date, not the UTC date", formatJst(cronCheckTime, "yyyy-MM-dd HH:mm"), "2026-09-02 07:23");
check("jstDateKey buckets into the JST calendar day", jstDateKey(cronCheckTime), "2026-09-02");
check(
  "formatJstIntl shows the JST date in ja-JP kanji formatting",
  formatJstIntl(cronCheckTime, { year: "numeric", month: "long", day: "numeric" }),
  "2026年9月2日"
);

// The monthly report's own month-boundary use case: a check at 03:00
// JST on 2026-09-01 (the very first hours of September, in Japan) must
// land INSIDE September's [start, end) range, not get pulled into
// August by a UTC-midnight boundary that's 9 hours early.
const earlySeptemberJst = new Date("2026-08-31T18:00:00.000Z"); // = 2026-09-01T03:00 JST
const septemberStart = jstMidnight(2026, 8, 1); // month is 0-indexed: 8 = September
const septemberEnd = jstMidnight(2026, 9, 1); // 9 = October
check(
  "A 03:00 JST Sep 1 check falls inside [September JST start, October JST start)",
  earlySeptemberJst >= septemberStart && earlySeptemberJst < septemberEnd,
  true
);
// The literal old bug, restated as a check: the WRONG (UTC-local)
// boundary would have excluded this same instant from September.
const buggyUtcSeptemberStart = new Date(2026, 8, 1);
check(
  "(sanity) the OLD buggy UTC-local boundary really would have excluded it - proves this is a real fix, not a no-op",
  earlySeptemberJst >= buggyUtcSeptemberStart,
  false
);

// jstMidnightFromDateString - the marketing-action-report use case.
check(
  "jstMidnightFromDateString('2026-09-02') is JST midnight, not UTC midnight",
  jstMidnightFromDateString("2026-09-02").toISOString(),
  "2026-09-01T15:00:00.000Z"
);

console.log(`\n${failures === 0 ? "All JST timezone checks passed." : `${failures} check(s) FAILED.`}`);
if (failures > 0) process.exit(1);
