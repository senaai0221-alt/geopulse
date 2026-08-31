/**
 * Pure "YYYY-MM" -> localized label formatter, split out of
 * app/dashboard/report/month-selector.tsx (a "use client" module) into
 * its own plain module so a Server Component can call it directly.
 *
 * Importing a plain (non-component) function from a "use client" file
 * into a Server Component compiles and type-checks fine, but breaks at
 * runtime: across that boundary Next.js only hands the server a
 * client-reference placeholder for the export, not the real function,
 * so invoking it directly (rather than rendering it as JSX) throws
 * "... is not a function". report/page.tsx needs this for the AI
 * insights prompt (lib/report-insights.ts), which is server-only - so
 * this lives here instead, and month-selector.tsx re-exports it for
 * every existing client-side caller.
 */
export function formatMonthLabel(month: string, locale: "ja" | "en"): string {
  const [year, monthNum] = month.split("-").map(Number);
  if (locale === "ja") return `${year}年${monthNum}月度`;
  const date = new Date(year, monthNum - 1, 1);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long" });
}
