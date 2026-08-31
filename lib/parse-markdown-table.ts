/**
 * Minimal GFM-style pipe-table parser - just enough to render the
 * report's AI-generated "next actions" table (see report-insights.ts,
 * app/dashboard/report/next-actions-table.tsx) without pulling in a
 * full Markdown library for one narrow, well-defined shape:
 *
 * | col a | col b |
 * | --- | --- |
 * | x | y |
 *
 * Deliberately forgiving of the model's own formatting quirks (no
 * leading/trailing pipe, extra whitespace, a stray blank line) since
 * this is parsing LLM output, not user-authored Markdown that's
 * already been linted. Returns null - never throws - for anything that
 * doesn't look like a real table, so the caller can fall back to
 * showing the raw text instead.
 */
export interface ParsedMarkdownTable {
  headers: string[];
  rows: string[][];
}

function splitRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((cell) => cell.trim());
}

/** A separator row is only dashes/colons/spaces per cell, e.g. "---" or ":--:". */
function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));
}

export function parseMarkdownTable(text: string): ParsedMarkdownTable | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|") || l.includes("|"));

  if (lines.length < 2) return null;

  const headers = splitRow(lines[0]);
  const separator = splitRow(lines[1]);
  if (headers.length === 0 || !isSeparatorRow(separator) || separator.length !== headers.length) return null;

  const rows = lines
    .slice(2)
    .map(splitRow)
    .filter((r) => r.length > 0 && r.some((cell) => cell.length > 0));

  if (rows.length === 0) return null;

  return { headers, rows };
}
