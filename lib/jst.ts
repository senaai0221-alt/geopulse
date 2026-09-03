/**
 * Every date this app shows a person or buckets data by is meant to
 * read in Japan Standard Time - it's a Japanese product, the daily cron
 * runs at 07:00 JST (see vercel.json), and every existing date/time
 * display already assumed JST implicitly by calling `Intl.DateTimeFormat
 * ("ja-JP", ...)` / `toLocaleString("ja-JP")` / plain date-fns `format()`
 * with NO explicit `timeZone`. That assumption silently held everywhere
 * this was ever tested locally (a dev machine already set to JST), but
 * is wrong on Vercel's serverless functions, which default to UTC with
 * no `TZ` env var set - the JA-locale formatting (kanji labels) still
 * applied, but the underlying year/month/day/hour came from UTC, not
 * JST. Concretely: the daily cron writes rankings at 07:00-07:30 JST,
 * which is 22:00-22:30 the PREVIOUS calendar day in UTC - every check
 * from every single cron run was landing in the wrong day's bucket on
 * the trend charts, the wrong month's report, and displaying a
 * timestamp ~9 hours (often a full calendar day) off on the dashboard,
 * in Slack, and in the CSV export.
 *
 * This module is the one place `Asia/Tokyo` gets named - every other
 * call site imports from here instead of reaching for `Intl`/
 * `toLocaleString`/date-fns `format()` directly, so this can't
 * regress one surface at a time again.
 */
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const JST_TIME_ZONE = "Asia/Tokyo";

/** `date-fns`'s own `format()`, but always reading `date`'s fields as
 *  they'd appear in JST, regardless of the server process's own local
 *  timezone. Use this everywhere a raw date-fns `format(date, pattern)`
 *  call used to appear. */
export function formatJst(date: Date | string, pattern: string): string {
  return formatInTimeZone(typeof date === "string" ? new Date(date) : date, JST_TIME_ZONE, pattern);
}

/** The `yyyy-MM-dd` JST calendar-day key for `date` - the correct
 *  bucketing key for "which day did this check happen on", since a
 *  07:00-07:30 JST cron run is the previous UTC calendar day. */
export function jstDateKey(date: Date | string): string {
  return formatJst(date, "yyyy-MM-dd");
}

/** `Intl.DateTimeFormat("ja-JP", options).format(date)`, pinned to
 *  Asia/Tokyo - drop-in replacement for the same call made without a
 *  `timeZone`, which silently used the server's own local time. */
export function formatJstIntl(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("ja-JP", { ...options, timeZone: JST_TIME_ZONE }).format(date);
}

/** The Date instant for local midnight of `year`-`monthIndex0`-`day`
 *  (0-based month, matching `Date`'s own constructor convention) AS
 *  MEASURED IN JST, not the server process's own local timezone -
 *  `new Date(year, monthIndex0, day)` is wrong here for the same
 *  reason as everything else in this file's own comment: on a UTC
 *  server it's UTC midnight, 9 hours before real JST midnight, which
 *  silently pulled the first ~9 hours of every JST calendar day/month
 *  into the PREVIOUS one for any date-range boundary built this way
 *  (see app/dashboard/report/page.tsx's monthRange, the one caller that
 *  needed this specifically). */
export function jstMidnight(year: number, monthIndex0: number, day: number): Date {
  // fromZonedTime treats its input as "wall-clock time in the given
  // zone" and returns the matching absolute instant - exactly the
  // inverse of formatInTimeZone above.
  const pad = (n: number) => String(n).padStart(2, "0");
  return fromZonedTime(`${year}-${pad(monthIndex0 + 1)}-${pad(day)}T00:00:00`, JST_TIME_ZONE);
}

/** Same as jstMidnight, but from a plain "YYYY-MM-DD" string (e.g. a
 *  `date`-typed DB column like marketing_actions.action_date, or a
 *  `<input type="date">` value) - the common case of "this calendar
 *  day, as a JST instant". `new Date(\`${dateStr}T00:00:00\`)` (no
 *  timezone suffix) is the wrong way to do this: a date-time string
 *  with no offset is parsed in the JS environment's own local
 *  timezone, UTC on Vercel, 9 hours off from the JST midnight the date
 *  string actually meant. */
export function jstMidnightFromDateString(dateStr: string): Date {
  return fromZonedTime(`${dateStr}T00:00:00`, JST_TIME_ZONE);
}
