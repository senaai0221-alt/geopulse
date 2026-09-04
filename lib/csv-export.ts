/**
 * Pure CSV-formatting helpers for the dashboard's "Download CSV" export
 * (see app/api/export/csv/route.ts). Split out into their own module -
 * rather than living inside route.ts - because a Next.js App Router
 * route file may only export the handful of names the framework
 * recognizes (GET, POST, dynamic, etc.); anything else fails the route's
 * own type-check. Living here also lets these be imported directly by
 * scripts/verify-notifications-and-exports.ts for testing, with no
 * request/Supabase session required.
 */
import { nameRegex, toHalfWidth, type LlmProvider } from "./geo-engine";

export const PROVIDER_LABELS: Record<LlmProvider, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
  gemini: "Gemini",
  grok: "Grok",
  deepseek: "DeepSeek",
};

export const SENTIMENT_LABELS: Record<string, string> = {
  positive: "好意的",
  neutral: "中立的",
  negative: "否定的",
};

/** Wraps a value in double quotes for CSV, escaping any quotes inside it. */
export function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvRow(values: (string | number | null | undefined)[]): string {
  return values.map(csvCell).join(",") + "\r\n";
}

/** UTF-8 BOM prepended to every export so Excel (including Japanese
 *  locale builds) reads the file as UTF-8 instead of guessing Shift-JIS
 *  and mangling every non-ASCII character. */
export const CSV_BOM = "﻿";

/** Header row for the flat, 1-row-per-measurement-event CSV (see
 *  app/api/export/csv/route.ts) - a BI-tool-ready log instead of the
 *  old two-section human-readable summary. */
export const FLAT_CSV_HEADERS = [
  "計測日時",
  "ブランド名",
  "プロンプト文面",
  "カテゴリ/タグ",
  "LLM名",
  "言及フラグ(1/0)",
  "表示順位",
  "論調",
  "言及スニペット",
  "参照URL(citations)",
];

const MENTION_SNIPPET_RADIUS = 150;

/**
 * The `radius` characters of raw response text on either side of the
 * brand's first mention - not the full `raw_response` (often several
 * hundred to a few thousand characters, awkward to skim/sort as a
 * single spreadsheet cell) and not a second, hand-rolled matcher
 * (reuses geo-engine's own nameRegex, the exact same rule that decided
 * this row counts as a mention in the first place - see
 * evidence-snippet.tsx for the same reasoning applied to the report
 * page's own highlighted quote). Internal whitespace/newlines are
 * collapsed to single spaces so the result reads as one clean line
 * rather than reproducing the original response's paragraph breaks;
 * csvCell's own quoting still makes an embedded newline safe either
 * way, this is purely for readability. Returns "" if there's no
 * response text or the brand name isn't actually found in it (should
 * only happen for a not-mentioned row, which callers aren't expected
 * to pass here in the first place).
 */
export function extractMentionSnippet(
  rawResponse: string | null | undefined,
  brandName: string,
  radius = MENTION_SNIPPET_RADIUS
): string {
  if (!rawResponse || !brandName.trim()) return "";
  // Match against a full-width-folded copy (see toHalfWidth) so a
  // brand rendered in full-width ASCII is found the same way
  // parseResponse already found it - toHalfWidth is length/position-
  // preserving, so the match index is still valid against the real,
  // unmodified rawResponse sliced below.
  const match = nameRegex(brandName, "i").exec(toHalfWidth(rawResponse));
  if (!match) return "";

  const start = Math.max(0, match.index - radius);
  const end = Math.min(rawResponse.length, match.index + match[0].length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < rawResponse.length ? "…" : "";
  const clipped = rawResponse.slice(start, end).replace(/\s+/g, " ").trim();

  return `${prefix}${clipped}${suffix}`;
}
