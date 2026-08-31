/**
 * Quick correctness check for lib/parse-markdown-table.ts against the
 * exact shape lib/report-insights.ts instructs the model to produce
 * (4 columns: 具体的対策/目的・効果/優先度/推奨担当), plus a few
 * malformed-input cases the parser needs to survive gracefully (LLM
 * output isn't guaranteed to be pixel-perfect Markdown).
 *
 * Run with: npx tsx scripts/verify-markdown-table-parser.ts
 */
import { parseMarkdownTable } from "../lib/parse-markdown-table";

let failures = 0;
function check(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} - ${label}`);
  if (!condition) failures++;
}

// 1. The exact shape the AI prompt asks for.
const wellFormed = `| 具体的対策 | 目的・効果 | 優先度 | 推奨担当 |
| --- | --- | --- | --- |
| Claudeでの構造化データ最適化 | 比較記事での推奨枠獲得 | 高 | SEO担当 |
| 競合Evernoteとの比較コンテンツ強化 | ポジショニング向上 | 中 | コンテンツ担当 |`;

const r1 = parseMarkdownTable(wellFormed);
check("well-formed table parses", r1 !== null);
check("well-formed table has 4 headers", r1?.headers.length === 4);
check("well-formed table has 2 rows", r1?.rows.length === 2);
check("first row's priority cell is 高", r1?.rows[0][2] === "高");
check("second row's owner cell is コンテンツ担当", r1?.rows[1][3] === "コンテンツ担当");

// 2. No leading/trailing pipes - still a valid table by GFM convention.
const noOuterPipes = `具体的対策 | 優先度
--- | ---
施策A | 高`;
const r2 = parseMarkdownTable(noOuterPipes);
check("table without outer pipes still parses", r2 !== null && r2.rows.length === 1);

// 3. Plain prose (what next-actions used to look like) must NOT parse as a table.
const plainText = "1. Claudeでの構造化データ最適化を行う\n2. 競合と比較したコンテンツを強化する";
check("plain bulleted text does not parse as a table", parseMarkdownTable(plainText) === null);

// 4. Empty string must not parse.
check("empty string does not parse", parseMarkdownTable("") === null);

// 5. A header with no separator row must not parse (avoids false positives on any text with a pipe in it).
const noSeparator = "施策 | 優先度\n何かのテキストに | が含まれる場合";
check("header without a real separator row does not parse", parseMarkdownTable(noSeparator) === null);

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
if (failures > 0) process.exit(1);
