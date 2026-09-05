/**
 * Regression check for the "テストブランド falsely marked as mentioned"
 * incident: a raw LLM response that only discusses an unrelated brand
 * (Anker) was being marked `mentioned: true` for a brand ("テストブラン
 * ド") whose name never appears in the text anywhere.
 *
 * Run with: npx tsx scripts/verify-mention-matching.ts
 *
 * This exercises the real, shipped `parseResponse()` from lib/geo-engine
 * (not a copy) - no API keys or network access needed, since this only
 * covers the deterministic exact-text-match layer. The companion fix in
 * `buildResult()` (gating the LLM judge call itself behind
 * `parsed.mentioned`, and no longer OR-ing the judge's own opinion into
 * the final `mentioned` verdict) means this layer alone is now the sole
 * source of truth for "mentioned" - so proving it right here is
 * sufficient to prove the incident can't recur.
 *
 * Also covers the later "プーメリー" false-圏外 incident (2026-09): a
 * brand registered under a common nickname whose product got described
 * by its official product name only in one response, with the nickname
 * nowhere in the text - see the `aliases` field added below and to
 * `brands`/`parseResponse` itself.
 *
 * And the "Shokz 5位" incident (2026-09): a brand whose actual #1
 * product was named only in bold text on the line AFTER its numbered
 * heading (a single-line-only match found nothing there), while a
 * LATER heading literally titled "【Shokz以外】" (brands OTHER than
 * Shokz) contained the brand name as a negated substring and was the
 * only thing a single-line match found - reported as rank 5 instead of
 * the real rank 1. See extractListItems' own full-block-per-entry
 * rewrite and parseResponse's hasPositiveMention negation guard.
 *
 * And the "ELFBAR 圏外" incident (2026-09): the brand is registered as
 * one word ("ELFBAR"), but every provider that mentioned it wrote it
 * as two separate title-cased words ("Elf Bar") - a rendering the old
 * exact-contiguous matcher never considered equal to "ELFBAR" at all,
 * producing a false "圏外" alert for a response that plainly listed
 * "Elf Bar BC5000" at #2. Root-caused against the real stored
 * raw_response, then confirmed via an isolated before/after diff
 * against every stored response for every brand in production (251
 * rows): only the genuinely-affected ELFBAR rows changed, and every
 * change was a newly-found true mention, never a lost one. Investigated
 * (and explicitly ruled out by the same real data) as the bug's cause:
 * case-sensitivity and Markdown decoration were NOT actually broken -
 * nameRegex already matches case-insensitively and `\b` boundaries
 * already ignore surrounding Markdown punctuation; both get their own
 * locked-in regression cases below anyway, since a fix report asked for
 * them explicitly. See nameRegex's own comment for the character-by-
 * character `\s?` fix and why it's gated to 4+ character names.
 *
 * Generalized beyond ELFBAR itself right after that fix, at the
 * operator's explicit request ("プーメリーだけの問題ではなく全ブランド
 * 共通の問題として改善してほしい"): the space-tolerance mechanism now
 * also tolerates a hyphen/dash in the same position (OPTIONAL_SEPARATOR
 * covers both), and a brand name rendered in full-width ("zenkaku")
 * ASCII - very common in Japanese-context output ("ＥＬＦＢＡＲ") and
 * a genuinely different Unicode code point per character, not a case
 * difference the "i" flag could ever have folded - is now matched via
 * toHalfWidth. Both are, deliberately, purely mechanical/formatting
 * normalizations that apply automatically to every brand with no
 * per-brand configuration - unlike a genuine nickname/alternate-name
 * (see the プーメリー case above), which has no mechanical rule to
 * derive it from and still requires registering it as an alias.
 *
 * And the "ドコモ 圏外" incident (2026-09, found running a deliberately
 * large real-brand-name demo across 3 telecom brands/20 prompts/5 real
 * days of LLM checks): a katakana brand name ("ドコモ") was written by
 * Grok in plain Latin letters ("docomo") in several responses, which
 * the matcher - correctly, for the literal katakana string - read as
 * "not mentioned," producing false "圏外" alerts for a brand that was
 * plainly on the list. See lib/romaji.ts's katakanaToHepburn (a
 * mechanical, table-driven transliteration - not a fuzzy guess) and
 * nameRegex's own comment for why this is additive to, not a
 * replacement for, exact katakana matching. This does NOT catch every
 * real spelling on its own (real romanizations often diverge from
 * strict phonetic Hepburn) - see lib/alert-message.ts's
 * `possibleMismatch` hint for the safety net.
 *
 * The cases below this point (2026-09) are not tied to any one real
 * incident - they're a deliberate stress test of exotic-but-real
 * brand-name shapes (a 2-character ASCII name, names built entirely
 * around a regex metacharacter, a name with an internal space), added
 * at the operator's explicit request after the fixes above: this is a
 * multi-tenant SaaS, and a customer can register literally any string
 * as their brand name, not just the specific names past incidents
 * happened to involve. Every one of these passes today with NO code
 * change - `nameRegex`/`buildCandidatePattern` already derive their
 * `\b` placement and escaping from the CANDIDATE STRING'S OWN Unicode
 * properties (see buildCandidatePattern's own comment), never from a
 * per-brand lookup table, so a brand-name shape nobody has hit yet is
 * handled by the same general machinery as one that has. These cases
 * exist to keep it that way - if a future change ever narrows that
 * generality back down to "works for the brand names in our test
 * fixtures," one of these should fail.
 */
import { parseResponse } from "../lib/geo-engine";

interface Case {
  name: string;
  rawResponse: string;
  brandName: string;
  aliases?: string[];
  competitors?: string[];
  expectMentioned: boolean;
  expectCompetitors?: string[];
  expectRankPosition?: number | null;
}

const cases: Case[] = [
  {
    // The exact reported incident.
    name: "Bug report: raw response only discusses Anker, brand is テストブランド",
    rawResponse:
      "おすすめのワイヤレスイヤホンをいくつかご紹介します。\n\n" +
      "1. Ankerのイヤホンはコストパフォーマンスに優れています。\n" +
      "2. Soundcoreも人気があり、ノイズキャンセリング機能が魅力です。\n\n" +
      "どちらも高評価のレビューが多く、初めての方にもおすすめです。",
    brandName: "テストブランド",
    expectMentioned: false,
  },
  {
    name: "Japanese brand name genuinely present in prose (was previously unmatchable due to the \\b bug)",
    rawResponse: "テストブランドは高品質な製品で知られており、多くのユーザーから支持されています。",
    brandName: "テストブランド",
    expectMentioned: true,
  },
  {
    name: "Japanese brand name genuinely present inside a numbered list",
    rawResponse: "1. テストブランド - 高品質と評判\n2. Anker - コスパ重視",
    brandName: "テストブランド",
    expectMentioned: true,
  },
  {
    name: "Japanese brand name NOT present, only a similar-looking different brand",
    rawResponse: "テストブランドXという製品もありますが、今回のおすすめはAnkerです。",
    brandName: "テストブランド",
    // Substring-contained ("テストブランドX" contains "テストブランド"),
    // which is the same "contains its full name" standard applied to
    // ASCII brands (e.g. "Ankermania" containing "Anker" would also
    // count) - documented here as expected/known behavior, not a bug.
    expectMentioned: true,
  },
  {
    name: "ASCII brand name present as a whole word",
    rawResponse: "For small business CRMs, Zonostick is a strong pick.",
    brandName: "Zonostick",
    expectMentioned: true,
  },
  {
    name: "ASCII brand name absent, only a substring collision inside another word",
    rawResponse: "For headphones, check out AnkerZone and Soundcore.",
    brandName: "Zone",
    // \b still applies for ASCII names, so "Zone" must NOT match inside
    // "AnkerZone".
    expectMentioned: false,
  },
  {
    name: "Empty response text",
    rawResponse: "",
    brandName: "テストブランド",
    expectMentioned: false,
  },
  {
    name: "Japanese competitor names are matched the same way as the brand name",
    rawResponse: "1. Anker\n2. 競合ブランドA\n3. Soundcore",
    brandName: "テストブランド",
    competitors: ["競合ブランドA", "競合ブランドB"],
    expectMentioned: false,
    expectCompetitors: ["競合ブランドA"],
  },
  {
    // The exact "プーメリー" incident: the brand is registered under its
    // common nickname, but this particular response only ever uses the
    // official product name - the nickname string itself never appears
    // anywhere. Without the alias, this must (correctly, for what it's
    // actually being asked) come back not-mentioned; WITH the alias
    // registered, the exact same response must be recognized, at its
    // real rank.
    name: "プーメリー incident: nickname absent, official product name present in a numbered list",
    rawResponse:
      "1. 【タカラトミー】くまのプーさん えらべる回転6WAY ジムにへんしんメリー\n" +
      "2. 【ピープル】うちの赤ちゃん世界一 スマート知育ジム＆メリー",
    brandName: "プーメリー",
    expectMentioned: false,
    expectRankPosition: null,
  },
  {
    name: "プーメリー incident, fixed: same response, official name registered as an alias",
    rawResponse:
      "1. 【タカラトミー】くまのプーさん えらべる回転6WAY ジムにへんしんメリー\n" +
      "2. 【ピープル】うちの赤ちゃん世界一 スマート知育ジム＆メリー",
    brandName: "プーメリー",
    aliases: ["くまのプーさん えらべる回転6WAY ジムにへんしんメリー"],
    expectMentioned: true,
    expectRankPosition: 1,
  },
  {
    // The exact "Shokz 5位" incident, reproduced from the real raw
    // response's structure (heading + bold product name on the NEXT
    // line, real rank-1 product; a later heading literally titled
    // "【Shokz以外】" further down).
    name: 'Shokz incident: product name on the line after the heading (not the heading itself), "以外" heading later',
    rawResponse:
      "### 1. 【総合1位】音質にこだわりたい方\n" +
      "**▶ Shokz OpenRun Pro 2**\n" +
      "* 特徴: 骨伝導と空気伝導のハイブリッド。\n" +
      "### 2. 【1番人気】スポーツ向け\n" +
      "**▶ Shokz OpenRun**\n" +
      "### 5. 【Shokz以外】夜間のランニング派に\n" +
      "**▶ SUUNTO Wing**\n" +
      "* 特徴: LEDライト付き。",
    brandName: "Shokz",
    expectMentioned: true,
    expectRankPosition: 1,
  },
  {
    // The negation guard in isolation: the brand appears ONLY inside a
    // "○○以外" (other than ○○) section, nowhere else at all - must NOT
    // read as a positive mention just because the substring is present.
    name: '"以外" negation guard: brand mentioned only as "Shokz以外", nowhere else',
    rawResponse: "### 1. 【Shokz以外】のおすすめ\n**▶ SUUNTO Wing**\n骨伝導以外の選択肢です。",
    brandName: "Shokz",
    expectMentioned: false,
    expectRankPosition: null,
  },
  {
    // The exact "ELFBAR" incident, reproduced from the real stored
    // raw_response's structure: registered as one word, every provider
    // wrote it as two ("Elf Bar"). expectRankPosition used to be 1 here
    // (the bullet's own position in an unordered "-" list) - now null,
    // since this response never actually states a rank number anywhere
    // (2026-09: plain "-"/"*"/"•" bullets stopped being treated as
    // implicit rank markers at all - see extractListItems' own comment).
    // What this case actually exists to cover - the ELFBAR/"Elf Bar"
    // mention-matching itself - is unaffected either way.
    name: 'ELFBAR incident: registered as one word, response writes it as two ("Elf Bar")',
    rawResponse:
      "-   **Elf Bar（エルフバー）**\n" +
      "    世界で最も売れているディスポーザブルの定番です。**「Elf Bar BC5000」**は、5000 puffと大容量で、コスパが非常に良いです。\n" +
      "-   **Geek Bar（ギークバー）**\n" +
      "    最近の海外市場で急伸しているブランドです。",
    brandName: "ELFBAR",
    competitors: ["Geek Bar"],
    expectMentioned: true,
    expectRankPosition: null,
    expectCompetitors: ["Geek Bar"],
  },
  {
    // Case-insensitivity was already correct before the ELFBAR fix (the
    // "i"/"gi" regex flag), but the bug report explicitly asked this be
    // covered directly - locking it in here.
    name: "Case-insensitive match: registered \"ELFBAR\", response writes lowercase \"elfbar\"",
    rawResponse: "使い捨てVAPEなら elfbar が定番の一つです。",
    brandName: "ELFBAR",
    expectMentioned: true,
  },
  {
    // Markdown decoration was already correct before the ELFBAR fix
    // too (`\b` boundaries don't care what non-word character sits on
    // the other side) - locking in bold and link-syntax cases directly,
    // as the bug report explicitly asked for.
    name: "Markdown bold does not block a match: **ELFBAR**",
    rawResponse: "おすすめの使い捨てVAPEは **ELFBAR** です。",
    brandName: "ELFBAR",
    expectMentioned: true,
  },
  {
    name: "Markdown link does not block a match: [ELFBAR](https://...)",
    rawResponse: "詳しくは[ELFBAR](https://www.elfbarjapan.jp/)の公式サイトをご覧ください。",
    brandName: "ELFBAR",
    expectMentioned: true,
  },
  {
    // The new character-by-character whitespace tolerance is gated to
    // 4+ non-space characters specifically so it doesn't start treating
    // two unrelated short tokens separated by a space as a match - a
    // short name must still require an exact contiguous match.
    name: "Short (<4 char) name is NOT loosened: \"GO\" must not match unrelated \"G\" ... \"O\" tokens with a word between",
    rawResponse: "この製品は G社の O型番 です。",
    brandName: "GO",
    expectMentioned: false,
  },
  {
    // The whitespace tolerance is additive, not a relaxation of the
    // existing negation guard - "Elf Bar以外" must still read as a
    // negated (non-positive) mention, exactly like the contiguous case.
    name: '"以外" negation guard still applies to the loosened match: "Elf Bar以外"',
    rawResponse: "### 1. 【Elf Bar以外】のおすすめ\n**▶ SUUNTO Wing**",
    brandName: "ELFBAR",
    expectMentioned: false,
  },
  {
    // Generalized fix, applies to every brand automatically: a hyphen
    // inserted where the registered name has none.
    name: 'Hyphen-tolerant match: registered "ELFBAR", response writes "ELF-BAR"',
    rawResponse: "使い捨てVAPEなら ELF-BAR が定番の一つです。",
    brandName: "ELFBAR",
    expectMentioned: true,
  },
  {
    // Generalized fix: full-width ("zenkaku") ASCII, extremely common
    // in Japanese-context LLM output and NOT something the existing
    // case-insensitive "i" flag could ever fold (different Unicode
    // code points per character, not upper/lower case of the same one).
    name: "Full-width (zenkaku) ASCII match: registered \"ELFBAR\", response writes \"ＥＬＦＢＡＲ\"",
    rawResponse: "使い捨てVAPEなら ＥＬＦＢＡＲ が定番の一つです。",
    brandName: "ELFBAR",
    expectMentioned: true,
  },
  {
    // Both generalizations composing at once, on a different brand -
    // proves this isn't an ELFBAR-specific patch.
    name: "Full-width + hyphen composing together on an unrelated brand name",
    rawResponse: "おすすめは「Ｇｅｅｋ－Ｂａｒ」です。",
    brandName: "GeekBar",
    expectMentioned: true,
  },
  {
    // Layer 1 of the ドコモ fix: katakana->Hepburn romaji auto-matching.
    // "トヨタ" mechanically romanizes to exactly "toyota" (unlike
    // "ドコモ"->"dokomo", which is one letter off from the real
    // "docomo" - see this file's own comment on why that residual gap
    // needs the alert-level hint, not this layer, to fully close).
    name: 'Katakana->romaji auto-match: registered "トヨタ", response writes "Toyota"',
    rawResponse: "自動車ならToyotaが世界的に有名です。",
    brandName: "トヨタ",
    expectMentioned: true,
  },
  {
    name: 'Katakana->romaji auto-match: registered "ホンダ", response writes lowercase "honda"',
    rawResponse: "バイクなら honda もおすすめです。",
    brandName: "ホンダ",
    expectMentioned: true,
  },
  {
    // The actual ドコモ incident: mechanical romaji ("dokomo") does NOT
    // equal the real spelling ("docomo") - this layer alone can't catch
    // it, by design (it's not a fuzzy guess). Locked in as a documented
    // known gap, not a silent regression.
    name: 'Katakana->romaji gap (expected, documented): "ドコモ" mechanically romanizes to "dokomo", not the real "docomo"',
    rawResponse: "5位 | docomo/au/SoftBank | エリア・安定性を最優先",
    brandName: "ドコモ",
    expectMentioned: false,
  },
  {
    // A kanji/katakana-mixed or already-Latin name must not attempt
    // romaji derivation at all (isPureKatakana gates this) - a garbled
    // hybrid pattern would just never match anything, which is safe,
    // but confirms the gate itself works rather than silently no-op'ing.
    name: "Mixed kanji+katakana name is not romaji-converted (isPureKatakana gate)",
    rawResponse: "資生堂の製品がおすすめです。",
    brandName: "資生堂",
    expectMentioned: true, // exact-text match on the kanji itself, unaffected by the romaji layer
  },
  {
    // A 2-character ASCII name is exactly the shape the "GO" case above
    // already covers in the abstract - this is the literal real brand
    // ("au") the operator raised as the concrete worry. `\b` requires a
    // genuine word-char/non-word-char transition on BOTH sides, so "au"
    // embedded inside a longer English word structurally cannot match -
    // this has nothing to do with "au" being a registered brand, it's
    // the same regex property "GO" already relies on.
    name: 'Short ASCII name ("au") does not false-positive inside "author"',
    rawResponse: "This guide was written by the author of several books.",
    brandName: "au",
    expectMentioned: false,
  },
  {
    name: 'Short ASCII name ("au") does not false-positive inside "default"',
    rawResponse: "Keep the default settings unless you have a reason to change them.",
    brandName: "au",
    expectMentioned: false,
  },
  {
    name: 'Short ASCII name ("au") matches as a genuine standalone mention',
    rawResponse: "電波の強さで選ぶなら au が安定しています。",
    brandName: "au",
    expectMentioned: true,
  },
  {
    name: 'Short ASCII name ("au") matches immediately adjacent to Japanese text with no space at all',
    rawResponse: "auの評判は高いです。",
    brandName: "au",
    expectMentioned: true,
  },
  {
    // escapeRegExp must treat "+" as a literal character, not the regex
    // quantifier it normally is - a name built entirely around a regex
    // metacharacter is exactly the case that would silently corrupt
    // into a broken (or dangerously loose) pattern if escaping were
    // ever missed for one candidate path.
    name: 'Symbol-containing name ("C++") matches literally, "+" is escaped rather than acting as a regex quantifier',
    rawResponse: "初心者にはC++がまず学ぶ価値のある言語です。",
    brandName: "C++",
    expectMentioned: true,
  },
  {
    name: 'Symbol-containing name ("C++") does not match on a bare "C" alone',
    rawResponse: "Cはシンプルな言語です。",
    brandName: "C++",
    expectMentioned: false,
  },
  {
    name: 'Symbol-containing name ("A&W") matches literally ("&" has no special regex meaning to begin with, but the leading/trailing \\b still has to be derived from the name\'s own first/last character correctly)',
    rawResponse: "ハンバーガーなら A&W もおすすめです。",
    brandName: "A&W",
    expectMentioned: true,
  },
  {
    name: '"." is escaped, not left as a regex wildcard that could match any character - "A.I." must not match an unrelated "AXI"',
    rawResponse: "AXIという指標を確認してください。",
    brandName: "A.I.",
    expectMentioned: false,
  },
  {
    name: 'Dotted name ("A.I.") still matches its own real, literal text',
    rawResponse: "A.I.を活用したサービスです。",
    brandName: "A.I.",
    expectMentioned: true,
  },
  {
    // Registered name itself contains a hyphen (unlike the ELFBAR case,
    // where the hyphen only ever appeared in the LLM's rendering) -
    // confirms the mandatory-hyphen path in the name doesn't get
    // accidentally treated as optional/droppable.
    name: 'Digit-and-hyphen name ("7-Eleven") matches its own real, literal text',
    rawResponse: "コンビニなら7-Elevenが近くにあります。",
    brandName: "7-Eleven",
    expectMentioned: true,
  },
  {
    // A name with its own internal space - must match as the whole
    // phrase, not just a fragment of it (a response merely discussing
    // "au" on its own, with no "PAY" anywhere, is a different product).
    name: 'Multi-word ASCII name with an internal space ("au PAY") matches as the whole phrase',
    rawResponse: "決済アプリはau PAYが便利です。",
    brandName: "au PAY",
    expectMentioned: true,
  },
  {
    name: 'Multi-word ASCII name with an internal space ("au PAY") does NOT match on "au" alone with no "PAY" anywhere',
    rawResponse: "電波が強いのはauです。",
    brandName: "au PAY",
    expectMentioned: false,
  },
  {
    // Not a realistic brand name, but a customer-controlled input field
    // regardless - nameRegex must never throw for ANY string a customer
    // could type into the brand-name field, however unusual. If this
    // constructs an invalid RegExp, parseResponse throws and the entire
    // daily check for that brand fails outright rather than degrading
    // to "not mentioned" for one odd response.
    name: "Symbol-heavy registered name never throws building its matcher (malformed-regex robustness)",
    rawResponse: "何かのテキストです。",
    brandName: "A(B)[C]{D}*E+F?G^H$I|J\\K",
    expectMentioned: false,
  },
  {
    // A general defensive case (2026-09, found while investigating the
    // real FLEXISPOT incident below, but not itself what that incident
    // turned out to be): a comparison table with no rank column (no
    // cell satisfies RANK_CELL) plus a single, sibling-less trailing
    // numbered sentence naming the brand - exactly the kind of lone "1."
    // that used to be enough to fabricate a full rank position on its
    // own. See MIN_TRUSTED_LIST_LENGTH in lib/geo-engine.ts.
    name: "Comparison table (no rank column) + one trailing solitary numbered sentence must not fabricate a rank",
    rawResponse:
      "| 比較項目 | ブランドX | 競合Y |\n" +
      "|---|---|---|\n" +
      "| 主な強み | 選択肢が多い | 価格とのバランスがよい |\n\n" +
      "1. まとめると、拡張性を重視するならブランドXが選択肢に入ります。",
    brandName: "ブランドX",
    competitors: ["競合Y"],
    expectMentioned: true,
    expectRankPosition: null,
  },
  {
    // The ACTUAL FLEXISPOT incident (2026-09), reproduced from the real
    // stored raw_response after the user shared the full text: a
    // deliberately non-ranking, comparison-style prompt
    // ("FLEXISPOTと他社の違いは？") answered with a comparison table (no
    // rank column - unaffected either way), followed by a section
    // headed "### FLEXISPOTの具体的な違い" ("FLEXISPOT's own specific
    // differences") containing a genuine 4-item bold-numbered list -
    // well past MIN_TRUSTED_LIST_LENGTH, so that guard alone does NOT
    // catch this. Every item is FLEXISPOT's own feature (tabletop
    // choice, load capacity, height memory, a caveat), not a ranking of
    // competing products - FLEXISPOT is genuinely mentioned inside two
    // of the four items (describing its own strengths from different
    // angles), which is exactly what let the old positional search
    // report rank #1 for a response that never ranked anything. See
    // preambleMentionsTrackedBrand in lib/geo-engine.ts for the fix.
    name: 'FLEXISPOT incident 1: a numbered breakdown of the brand\'s OWN features (headed "FLEXISPOTの具体的な違い"), not a competing-entity ranking, must not fabricate a rank',
    rawResponse:
      "| 比較項目 | FLEXISPOT | ニトリ | IKEA |\n" +
      "|---|---|---|---|\n" +
      "| 主な強み | 電動昇降デスク専門に近く、モデル・天板の選択肢が多い | 購入しやすく価格とのバランスがよい | 店舗・家具との統一感 |\n" +
      "| 耐荷重 | 最大200kgをうたうモデルがある | モデルにより異なる | デュアルモーター搭載 |\n\n" +
      "### FLEXISPOTの具体的な違い\n\n" +
      "**1. 天板を自分で選びやすい**\n" +
      "FLEXISPOTは脚フレーム単体でも販売しているため、無垢材、集成材、既存の天板などを取り付けやすいのが特徴です。\n" +
      "一方、ニトリやIKEAは、購入時に天板と脚がセットになった製品を選ぶほうが簡単です。\n\n" +
      "**2. 重いPC機材に強い**\n" +
      "大型モニター、モニターアーム、デスクトップPC、スピーカーなどを載せる人にはFLEXISPOTが向いています。\n\n" +
      "**3. 高さ調整機能が充実している**\n" +
      "座り・立ち姿勢をボタンで切り替えられ、高さを複数登録できるモデルがあります。\n\n" +
      "**4. ただし、家具としての完成度や購入の簡単さでは他社が有利な場合もある**\n" +
      "一方でニトリやIKEAは店舗で実物を確認しやすい利点があります。",
    brandName: "FLEXISPOT",
    competitors: ["ニトリ", "IKEA"],
    expectMentioned: true,
    expectRankPosition: null,
  },
  {
    // FLEXISPOT incident 2 (2026-09, reported the same day, a second
    // real Gemini raw_response for a DIFFERENT prompt): "FLEXISPOTの
    // 評判や口コミは？" ("what's FLEXISPOT's reputation/reviews like?") -
    // a single-brand review question with no competitor comparison
    // requested at all. The intro paragraph names FLEXISPOT directly,
    // then "### 1. 良い評判・口コミ（メリット）" / "### 2. 悪い評判・注意点
    // （デメリット）" / "### 3. 主な人気モデルの評判" are plain ARTICLE-
    // OUTLINE numbering (pros / cons / popular models), not competing
    // entities - yet the old code reported rank #1, since headingIndices
    // has 3 genuine entries (past MIN_TRUSTED_LIST_LENGTH) and FLEXISPOT
    // is genuinely mentioned inside item 1's own pros section. This is
    // what proved the FIRST fix (checking only the single heading line
    // immediately touching the list) insufficient - the brand is named
    // several lines of prose above "### 1.", separated by a "---" rule,
    // not by another heading - and motivated broadening
    // preambleMentionsTrackedBrand to scan the whole preamble instead.
    name: 'FLEXISPOT incident 2: article-outline numbering (良い評判/悪い評判/人気モデル) for a single-brand review prompt, brand named only in prose several lines above "### 1.", must not fabricate a rank',
    rawResponse:
      "電動昇降デスクの代名詞的存在である**「FLEXISPOT（フレキシスポット）」**は、テレワークの普及に伴い日本でも非常に人気の高いブランドです。\n\n" +
      "ネット上のレビュー、SNS（X/Twitter、YouTubeなど）、価格.comなどの評判を総合的にまとめました。\n\n" +
      "---\n\n" +
      "### 1. 良い評判・口コミ（メリット）\n\n" +
      "#### ① 圧倒的コストパフォーマンス\n" +
      "* 他社のオフィス家具メーカーの電動昇降デスクは10万円以上することがザラですが、FLEXISPOTは3万〜7万円前後で購入できます。\n\n" +
      "### 2. 悪い評判・注意点（デメリット）\n\n" +
      "#### ① とにかく重くて組み立てが大変\n" +
      "* パーツが重すぎて、女性一人では組み立てや裏返しが無理という声が多数あります。\n\n" +
      "### 3. 主な人気モデルの評判\n\n" +
      "* E7 / E7 Pro（一番人気・定番）\n",
    brandName: "FLEXISPOT",
    competitors: ["ニトリ", "IKEA"],
    expectMentioned: true,
    expectRankPosition: null,
  },
];

let failures = 0;

for (const c of cases) {
  // A thrown error (e.g. an invalid RegExp built from an unusual
  // registered name - see the symbol-heavy case above) must show up as
  // one clean FAIL, not crash the whole suite before every later case
  // gets a chance to run.
  let result: ReturnType<typeof parseResponse>;
  try {
    result = parseResponse(c.rawResponse, c.brandName, c.aliases ?? [], c.competitors ?? []);
  } catch (err) {
    failures++;
    console.log(`FAIL - ${c.name}`);
    console.log(`     threw: ${err instanceof Error ? err.message : String(err)}`);
    continue;
  }
  const mentionedOk = result.mentioned === c.expectMentioned;
  const competitorsOk =
    c.expectCompetitors === undefined ||
    JSON.stringify([...result.competitorsMentioned].sort()) ===
      JSON.stringify([...c.expectCompetitors].sort());
  const rankOk = c.expectRankPosition === undefined || result.rankPosition === c.expectRankPosition;
  const ok = mentionedOk && competitorsOk && rankOk;

  console.log(`${ok ? "PASS" : "FAIL"} - ${c.name}`);
  if (!ok) {
    failures++;
    console.log(`     expected mentioned=${c.expectMentioned}, got mentioned=${result.mentioned}`);
    if (c.expectCompetitors !== undefined) {
      console.log(
        `     expected competitors=${JSON.stringify(c.expectCompetitors)}, got ${JSON.stringify(
          result.competitorsMentioned
        )}`
      );
    }
    if (c.expectRankPosition !== undefined) {
      console.log(`     expected rankPosition=${c.expectRankPosition}, got ${result.rankPosition}`);
    }
  }
}

console.log(`\n${cases.length - failures}/${cases.length} cases passed.`);
if (failures > 0) {
  console.error(`${failures} case(s) FAILED.`);
  process.exit(1);
}
