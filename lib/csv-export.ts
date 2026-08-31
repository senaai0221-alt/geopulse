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
import type { LlmProvider } from "./geo-engine";

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
