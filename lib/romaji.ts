/**
 * Deterministic katakana -> Hepburn-romanization conversion, plus a
 * Levenshtein distance helper for the "possible mismatch" hint (see
 * lib/alert-message.ts). Both exist for exactly one reason: a brand
 * registered in katakana ("ドコモ") is routinely written by an LLM in
 * plain Latin letters ("docomo") instead - a 2026-09 incident (running
 * a deliberately large, real-brand-name demo) found this producing
 * false "圏外" (disappeared) alerts for a brand that was plainly
 * mentioned, just not in the script it was registered under.
 *
 * This is a MECHANICAL, table-driven transformation - not a fuzzy
 * heuristic, not an LLM judgment call - so it stays consistent with
 * this codebase's whole exact-text-match philosophy (see nameRegex's
 * own comment): every character maps to a fixed, unambiguous romaji
 * syllable, the same way toHalfWidth maps one code point to another.
 * It is NOT a complete fix on its own - real corporate brand spellings
 * routinely diverge from strict phonetic Hepburn (SONY has no phonetic
 * relationship to "sonii"; even "ドコモ" itself romanizes mechanically
 * to "dokomo", one letter off from the real "docomo") - which is
 * exactly why this module also exports a Levenshtein distance helper,
 * used only to *flag* a low-confidence near-miss for human review
 * (lib/alert-message.ts's `possibleMismatch`), never to silently
 * decide a mention exists.
 */

// Two-character (yōon) combinations must be checked before any
// single-character lookup, or e.g. "キャ" would romanize as "ki" + "a"
// ("kia") instead of the correct "kya".
const YOON: Record<string, string> = {
  キャ: "kya", キュ: "kyu", キョ: "kyo",
  シャ: "sha", シュ: "shu", ショ: "sho",
  チャ: "cha", チュ: "chu", チョ: "cho",
  ニャ: "nya", ニュ: "nyu", ニョ: "nyo",
  ヒャ: "hya", ヒュ: "hyu", ヒョ: "hyo",
  ミャ: "mya", ミュ: "myu", ミョ: "myo",
  リャ: "rya", リュ: "ryu", リョ: "ryo",
  ギャ: "gya", ギュ: "gyu", ギョ: "gyo",
  ジャ: "ja", ジュ: "ju", ジョ: "jo",
  ヂャ: "ja", ヂュ: "ju", ヂョ: "jo",
  ビャ: "bya", ビュ: "byu", ビョ: "byo",
  ピャ: "pya", ピュ: "pyu", ピョ: "pyo",
  ファ: "fa", フィ: "fi", フェ: "fe", フォ: "fo",
  ウィ: "wi", ウェ: "we", ウォ: "wo",
  ヴァ: "va", ヴィ: "vi", ヴェ: "ve", ヴォ: "vo",
  ティ: "ti", トゥ: "tu", ディ: "di", ドゥ: "du",
  チェ: "che", ジェ: "je", シェ: "she",
};

const SEION: Record<string, string> = {
  ア: "a", イ: "i", ウ: "u", エ: "e", オ: "o",
  カ: "ka", キ: "ki", ク: "ku", ケ: "ke", コ: "ko",
  サ: "sa", シ: "shi", ス: "su", セ: "se", ソ: "so",
  タ: "ta", チ: "chi", ツ: "tsu", テ: "te", ト: "to",
  ナ: "na", ニ: "ni", ヌ: "nu", ネ: "ne", ノ: "no",
  ハ: "ha", ヒ: "hi", フ: "fu", ヘ: "he", ホ: "ho",
  マ: "ma", ミ: "mi", ム: "mu", メ: "me", モ: "mo",
  ヤ: "ya", ユ: "yu", ヨ: "yo",
  ラ: "ra", リ: "ri", ル: "ru", レ: "re", ロ: "ro",
  ワ: "wa", ヲ: "wo", ン: "n",
  ガ: "ga", ギ: "gi", グ: "gu", ゲ: "ge", ゴ: "go",
  ザ: "za", ジ: "ji", ズ: "zu", ゼ: "ze", ゾ: "zo",
  ダ: "da", ヂ: "ji", ヅ: "zu", デ: "de", ド: "do",
  バ: "ba", ビ: "bi", ブ: "bu", ベ: "be", ボ: "bo",
  パ: "pa", ピ: "pi", プ: "pu", ペ: "pe", ポ: "po",
  ヴ: "vu",
};

const SOKUON = "ッ";
const CHOONPU = "ー";
const VOWELS = new Set(["a", "i", "u", "e", "o"]);

/** True if every character in `s` is katakana, the long-vowel mark, or
 *  whitespace/ASCII (already-half-width) - i.e. a name this module can
 *  actually attempt to romanize meaningfully. A mixed kanji/katakana
 *  name (or a name already in Latin letters) returns false; callers
 *  skip romaji derivation entirely rather than produce a nonsense
 *  half-converted hybrid. */
export function isPureKatakana(s: string): boolean {
  if (!s.trim()) return false;
  for (const ch of s) {
    const isKatakana = ch >= "゠" && ch <= "ヿ";
    const isAscii = ch.charCodeAt(0) < 128;
    if (!isKatakana && !isAscii) return false;
  }
  // Require at least one actual katakana character - an all-ASCII
  // string trivially "passes" the loop above but has nothing to
  // romanize.
  return /[゠-ヿ]/.test(s);
}

/**
 * Mechanically romanizes a katakana string via Hepburn romanization.
 * Returns null if `s` isn't (see isPureKatakana) a string this can
 * meaningfully convert. Handles yōon (combined kana), sokuon (small ッ,
 * doubles the following consonant - "ッチ" -> "tchi", not "cchi", per
 * standard Hepburn), and chōonpu (ー, repeats the preceding vowel).
 */
export function katakanaToHepburn(s: string): string | null {
  if (!isPureKatakana(s)) return null;

  const chars = [...s];
  let out = "";
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];

    if (ch === SOKUON) {
      // Look ahead to the next syllable's romaji and double its
      // leading consonant (or "t" if it starts with "ch", the
      // standard Hepburn exception - "ッチ" -> "tchi").
      const nextTwo = chars.slice(i + 1, i + 3).join("");
      const nextOne = chars[i + 1];
      const nextRomaji = YOON[nextTwo] ?? SEION[nextOne];
      if (nextRomaji) {
        out += nextRomaji.startsWith("ch") ? "t" : nextRomaji[0];
      }
      i += 1;
      continue;
    }

    if (ch === CHOONPU) {
      const lastVowel = [...out].reverse().find((c) => VOWELS.has(c));
      if (lastVowel) out += lastVowel;
      i += 1;
      continue;
    }

    const two = chars.slice(i, i + 2).join("");
    if (YOON[two]) {
      out += YOON[two];
      i += 2;
      continue;
    }

    if (SEION[ch]) {
      out += SEION[ch];
      i += 1;
      continue;
    }

    // Whitespace or already-ASCII character (digits, half-width
    // punctuation) - passed through unchanged.
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Standard Levenshtein (edit) distance, case-insensitive. Used only by
 * the "possible mismatch" alert hint (lib/alert-message.ts) - a
 * near-miss signal for human review, never a basis for deciding
 * `mentioned` itself (see this module's own top comment for why).
 */
export function levenshteinDistance(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Looks for a Latin-letter word in `text` that's suspiciously close
 * to - but doesn't exactly equal - `katakanaName`'s mechanically-
 * derived romaji spelling (katakanaToHepburn). A near miss like this
 * means the real LLM output likely used a genuine romanization that
 * simply diverges from strict phonetic Hepburn (the actual ドコモ
 * incident: mechanical "dokomo" vs. the real "docomo", distance 1) -
 * nameRegex's own romaji layer already matches the exact mechanical
 * spelling, so by the time this is worth calling (only when
 * `mentioned` has already come back false), an exact match is already
 * known not to exist; this is strictly a *near*-miss detector.
 *
 * Returns the matched word (for the caller to quote back for review)
 * or null. NEVER used to decide `mentioned` or a rank - only to attach
 * a "please double-check this one" caveat to an alert that's about to
 * claim a disappearance (see lib/alert-message.ts's `possibleMismatch`)
 * - a Levenshtein-distance heuristic is exactly the kind of fuzzy
 * judgment this codebase avoids for deciding facts, but is reasonable
 * for flagging uncertainty for a human to resolve.
 *
 * The distance threshold scales with the candidate's own length (a
 * short candidate has less room before an unrelated word starts
 * looking "close" by pure chance) and short candidates (<4 chars) are
 * skipped entirely - same false-positive-avoidance reasoning as
 * nameRegex's own 4-character gate for the space/hyphen tolerance.
 */
export function findRomajiNearMiss(text: string, katakanaName: string): string | null {
  const candidate = katakanaToHepburn(katakanaName.trim());
  if (!candidate || candidate.length < 4) return null;

  const threshold = candidate.length <= 6 ? 1 : 2;
  const words = text.match(/[A-Za-z]+/g) ?? [];

  for (const word of words) {
    if (Math.abs(word.length - candidate.length) > threshold) continue;
    if (levenshteinDistance(word, candidate) <= threshold) {
      return word;
    }
  }
  return null;
}
