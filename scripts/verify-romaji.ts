/**
 * Regression check for lib/romaji.ts - the katakana->Hepburn
 * transliteration + Levenshtein "near miss" hint added for the
 * "ドコモ 圏外" incident (2026-09, found running a deliberately large
 * real-brand-name demo: Grok wrote "docomo" for a brand registered as
 * "ドコモ", and the exact-text matcher, correctly for the literal
 * katakana string, read it as not mentioned).
 *
 * Run with: npx tsx scripts/verify-romaji.ts
 */
import { katakanaToHepburn, isPureKatakana, levenshteinDistance, findRomajiNearMiss } from "../lib/romaji";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} - ${label}`);
  if (!ok) {
    console.log(`     expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failures++;
  }
}

console.log("--- katakanaToHepburn: basic syllables, yōon, sokuon, chōonpu ---");
check('"ドコモ" -> "dokomo" (the actual incident - one letter off from the real "docomo")', katakanaToHepburn("ドコモ"), "dokomo");
check('"トヨタ" -> "toyota" (matches the real corporate spelling exactly)', katakanaToHepburn("トヨタ"), "toyota");
check('"ホンダ" -> "honda" (matches exactly)', katakanaToHepburn("ホンダ"), "honda");
check('"ソニー" -> "sonii" (does NOT match the real "Sony" - documented limit, not a bug)', katakanaToHepburn("ソニー"), "sonii");
check('yōon: "キャリア" -> "kyaria"', katakanaToHepburn("キャリア"), "kyaria");
check('sokuon: "バッグ" -> "baggu" (doubled consonant)', katakanaToHepburn("バッグ"), "baggu");
check('sokuon before ch: "マッチ" -> "matchi" (Hepburn tch exception, not cchi)', katakanaToHepburn("マッチ"), "matchi");
check('chōonpu: "ラーメン" -> "raamen" (repeated vowel)', katakanaToHepburn("ラーメン"), "raamen");
check('mixed digits pass through: "ソフト1号" contains non-katakana', katakanaToHepburn("ソフト1号"), null);

console.log("\n--- isPureKatakana gate ---");
check('pure katakana: "ドコモ"', isPureKatakana("ドコモ"), true);
check("already-Latin name doesn't attempt conversion: \"ELFBAR\"", katakanaToHepburn("ELFBAR"), null);
check('mixed kanji+katakana: "資生堂" is not pure katakana', isPureKatakana("資生堂"), false);
check("empty string is not pure katakana", isPureKatakana(""), false);

console.log("\n--- levenshteinDistance ---");
check('"dokomo" vs "docomo" (the real incident) = 1', levenshteinDistance("dokomo", "docomo"), 1);
check('identical strings = 0', levenshteinDistance("docomo", "docomo"), 0);
check("case-insensitive", levenshteinDistance("DoComo", "docomo"), 0);

console.log("\n--- findRomajiNearMiss: the actual alert-hint safety net ---");
check(
  "the real ドコモ incident: near-miss found",
  findRomajiNearMiss("5位 | docomo/au/SoftBank | エリア・安定性を最優先", "ドコモ"),
  "docomo"
);
check(
  "no near miss for a response with no Latin text at all",
  findRomajiNearMiss("楽天モバイルが1位です。", "ドコモ"),
  null
);
check(
  "unrelated Latin words present must NOT false-positive",
  findRomajiNearMiss("Rakuten Mobile is great, so is SoftBank.", "ドコモ"),
  null
);
check(
  "a non-katakana brand name never attempts a near-miss check",
  findRomajiNearMiss("docomo is mentioned here.", "ELFBAR"),
  null
);
check(
  "a short (<4 char mechanical romaji) katakana name is skipped - avoids false positives on tiny words",
  findRomajiNearMiss("auが1位です。", "アウ"),
  null
);

console.log(`\n${failures === 0 ? "All romaji checks passed." : `${failures} check(s) FAILED.`}`);
if (failures > 0) process.exit(1);
