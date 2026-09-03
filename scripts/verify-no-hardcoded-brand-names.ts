/**
 * Guards a specific design property of lib/geo-engine.ts's brand-
 * matching engine (nameRegex/buildCandidatePattern/extractListItems/
 * extractTableItems/hasPositiveMention/parseResponse and their shared
 * helpers): every rule in it is derived from the CANDIDATE STRING'S OWN
 * structure (Unicode code points, ASCII-word-char-ness, regex-
 * metacharacter escaping) or the RESPONSE TEXT'S OWN document structure
 * (table cells, blank lines, list markers) - never from a specific
 * brand/product name written into the logic itself. This is what makes
 * every fix in this file (2026-09: ELFBAR, プーメリー, ドコモ, Shokz,
 * table parsing, the criteria-list guard, ...) apply automatically to
 * every brand a customer could ever register, including ones nobody at
 * this company has seen yet - the whole point of a SaaS product with
 * customer-controlled brand names.
 *
 * Every one of those incidents is still named in this file's own
 * comments, on purpose - each comment documents the real production
 * case that motivated its GENERAL rule. That's the opposite of a
 * regression: it's exactly why this guard strips comments before
 * scanning, rather than banning those words from the file outright.
 * What must never appear is a specific brand's name as a STRING LITERAL
 * inside the engine's actual executable code - an `if (name ===
 * "ELFBAR")`-shaped special case would be a real regression toward
 * per-brand patches, silently narrowing behavior that today works for
 * any name back down to "works for the names we've personally tested."
 *
 * Detection: after stripping comments, flag any quoted string literal
 * that LOOKS like a proper noun - starts with an uppercase Latin
 * letter, or is 2+ pure katakana characters - inside the engine
 * section of the file. Every genuine pattern fragment in this engine
 * is built from lowercase regex syntax (\d, \s, character classes,
 * escaped punctuation) or all-lowercase/symbol literals (flags like
 * "i"/"gi", OPTIONAL_SEPARATOR's own character class) - a capitalized-
 * or-katakana quoted literal has no legitimate reason to appear here at
 * all, so any hit is a direct signal to go look, not a probabilistic
 * guess.
 *
 * Scoped to the brand-matching engine section only (escapeRegExp
 * through the start of the LLM-judge section) - the provider-calling
 * functions above it (callChatGPT, callClaude, ...) legitimately
 * contain capitalized string literals with nothing to do with brand
 * names (HTTP header names like "Content-Type", model id fragments),
 * and scanning the whole file would just make this guard noisy enough
 * to ignore.
 *
 * Run: npx tsx scripts/verify-no-hardcoded-brand-names.ts
 */
import * as fs from "fs";
import * as path from "path";

const filePath = path.join(__dirname, "..", "lib", "geo-engine.ts");
const source = fs.readFileSync(filePath, "utf-8");

const startMarker = "function escapeRegExp";
const endMarker = "// Lightweight LLM judge";
const startIdx = source.indexOf(startMarker);
const endIdx = source.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
  console.error(
    "FAIL - could not locate the brand-matching engine section markers " +
      `("${startMarker}" / "${endMarker}") in lib/geo-engine.ts - the file ` +
      "may have been restructured; update this guard's markers rather than " +
      "skip the check."
  );
  process.exit(1);
}

const engineSection = source.slice(startIdx, endIdx);

// Strip block comments, then line comments - a real string literal
// inside a doc comment (documenting a past incident by name) must
// never trip this guard; only literals in actual executable code count.
const noBlockComments = engineSection.replace(/\/\*[\s\S]*?\*\//g, "");
const noComments = noBlockComments
  .split("\n")
  .map((line) => line.replace(/\/\/.*/g, ""))
  .join("\n");

// A quoted string (single, double, or template-literal delimited)
// whose content starts with an uppercase Latin letter followed by 2+
// more letters, or is 2+ pure katakana characters end to end.
const properNounLiteral = /["'`]([A-Z][a-zA-Z]{2,}|[゠-ヿ]{2,})["'`]/g;

const hits: string[] = [];
let match: RegExpExecArray | null;
while ((match = properNounLiteral.exec(noComments)) !== null) {
  hits.push(match[0]);
}

if (hits.length > 0) {
  console.log("FAIL - possible hardcoded brand-name literal(s) found in the brand-matching engine:");
  for (const h of hits) console.log(`  ${h}`);
  console.log(
    "\nIf this is a genuine false positive (a structural constant that happens " +
      "to look proper-noun-shaped), extend this guard's allowlist rather than " +
      "silently ignore the failure."
  );
  process.exit(1);
}

console.log(
  `PASS - no hardcoded brand-name literals found in lib/geo-engine.ts's brand-matching engine ` +
    `(${engineSection.split("\n").length} lines scanned, comments excluded).`
);
