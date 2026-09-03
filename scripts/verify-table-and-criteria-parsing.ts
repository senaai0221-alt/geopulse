/**
 * Regression coverage for the 2026-09 CSV-export audit (P0): Markdown
 * table rank extraction, the criteria-list false-positive guard, and
 * the table strategy correctly overriding a heading-block's own
 * flattened (wrong) match. Every raw_response below is the real,
 * unmodified text pulled from production for the exact incident it
 * documents - see each case's own comment for the row it came from.
 *
 * Run: npx tsx scripts/verify-table-and-criteria-parsing.ts
 */
import { parseResponse } from "../lib/geo-engine";

let pass = 0;
let fail = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    pass++;
    console.log(`PASS - ${label}`);
  } else {
    fail++;
    console.log(`FAIL - ${label}`);
  }
}

// ---------------------------------------------------------------------
// Case 1: Markdown table only, no heading/bold/bullet list anywhere -
// rankings.id fee4a215-aab3-4d39-a212-01bbfb6fec78 (Grok, ドコモ).
// Before this fix: extractListItems returned [] entirely (no strategy
// recognized a table row), so mentioned=true but rankPosition stayed
// null despite the table plainly stating "2位" for ahamo（ドコモ）.
// ---------------------------------------------------------------------
{
  const raw = `今一番のおすすめは、**用途によって変わる**けど、総合的に見ると以下の感じです。

### 現在の主流おすすめ（2025年時点）

| 順位 | 会社 | おすすめの人 | 評価ポイント | デメリット |
|------|------|-------------|-------------|-----------|
| **1位** | **Rakuten Mobile** | コスパ重視・データたくさん使う人 | 月額1,078〜3,278円で**無制限**、楽天経済圏ユーザーなら最強 | 地方の繋がりやすさはまだdocomoに劣る |
| **2位** | **ahamo（ドコモ）** | バランス重視・安定を求める人 | 速度・エリア・サポートのバランスが良い | 20GB超えると追加料金がかかる |
| **3位** | **povo（au）** | 柔軟にプランを変えたい人 | トッピング方式で無駄がない | 基本的に自分で管理する必要がある |

### 結論（ざっくり）

- **とにかく安くしたい・データ無制限がいい** → **Rakuten Mobile**が現在一番おすすめ
- **エリアの安定性・速度を重視** → **ahamo**`;
  const result = parseResponse(raw, "ドコモ", [], ["au"]);
  check("table-only response: mentioned=true", result.mentioned === true);
  check("table-only response: rankPosition=2 (was null before the table strategy)", result.rankPosition === 2);
}

// ---------------------------------------------------------------------
// Case 2: A criteria list (not a brand ranking at all) whose LAST item
// absorbs an unrelated closing paragraph - rankings.id
// b80a000c-c3f9-4f5e-bcb4-ed978ff8b4c6 (ChatGPT, ドコモ). Before this
// fix: rankPosition=5, reading "5. **サポート体制**" as the brand's own
// 5th-ranked entry.
// ---------------------------------------------------------------------
{
  const raw = `学生におすすめの携帯キャリアは、以下のポイントを考慮して選ぶと良いでしょう。

1. **料金プラン**: 学生向けの割引プランや特典があるキャリアを選ぶと、コストを抑えられます。例えば、学割プランを提供しているキャリアがあります。

2. **データ容量**: 学生はオンライン授業やSNS、動画視聴などでデータを多く使用することが多いため、十分なデータ容量があるプランを選ぶと安心です。

3. **通信品質**: 住んでいる地域や通学先での通信品質が良いキャリアを選ぶことが重要です。口コミやレビューを参考にすると良いでしょう。

4. **特典やサービス**: 音楽ストリーミングや動画配信サービスの無料利用、ポイント還元などの特典があるキャリアも魅力的です。

5. **サポート体制**: 学生生活で困ったときに迅速に対応してくれるサポートがあると安心です。

具体的なキャリアとしては、NTTドコモ、au、ソフトバンクなどの大手キャリアが学割プランを提供しています。また、格安SIMを提供するMVNO（仮想移動体通信事業者）もコストパフォーマンスが良い場合があります。自分の使用状況や予算に合わせて比較検討してみてください。`;
  const result = parseResponse(raw, "ドコモ", [], ["ソフトバンク", "au"]);
  check("criteria-list response: mentioned=true (still found via the whole-text search)", result.mentioned === true);
  check(
    "criteria-list response: rankPosition=null (no longer fabricates 5 from an unrelated closing paragraph)",
    result.rankPosition === null
  );
}

// ---------------------------------------------------------------------
// Case 3: A numbered-heading block whose own table gives the real
// per-row rank, which the old heading-only strategy flattened to "the
// heading's own array index" - rankings.id
// 2bca4de5-efa8-4bf2-aaae-cea5091245c9 (Grok, ドコモ). Before the table
// strategy: rankPosition=1 (item 0's whole block, including the table,
// matched "ドコモ" somewhere inside it) even though the table itself
// states ahamo（ドコモ）is 2位, not 1位.
// ---------------------------------------------------------------------
{
  const raw = `携帯会社を乗り換えるなら、**2025年現在のお得度**で言うと、以下のような選択肢が主流です。

### 1. **一番おすすめ（コスパ重視）**
| 順位 | 会社・プラン | 月額目安（税込） | おすすめの人 | 注意点 |
|------|--------------|------------------|--------------|--------|
| 1位 | **Rakuten Mobile** | 1,078〜3,278円（無制限） | データ多め・とにかく安くしたい人 | 地方・地下・建物内は繋がりにくい場合あり |
| 2位 | **ahamo（ドコモ）** | 2,970〜3,960円 | ドコモ回線がいい人 | 20GB/60GBプランがシンプル |
| 3位 | **povo2.0（au）** | 2,700円〜（トッピング次第） | 自分の使い方に合わせて調整したい人 | 基本0円＋トッピング制 |
| 4位 | **LINEMO（ソフトバンク）** | 2,970〜3,828円 | ソフトバンク回線がいい人 | ミニプラン（3GB）が安い |

### 2. **用途別おすすめ**

- **とにかく安くしたい人** → **Rakuten Mobile**（一番安い）
- **安定した回線がいい人** → **ahamo** または **LINEMO**`;
  const result = parseResponse(raw, "ドコモ", [], ["au", "ソフトバンク"]);
  check("table-under-heading response: mentioned=true", result.mentioned === true);
  check(
    "table-under-heading response: rankPosition=2, from the table's OWN row - not 1, the enclosing heading's array index",
    result.rankPosition === 2
  );
}

// ---------------------------------------------------------------------
// Case 4 (regression guard): an EARLY heading item's real content is a
// comparison table separated from its own heading by a blank line -
// the exact real-production shape that broke when firstParagraph was
// first applied to every item instead of only the last one. Real
// Notion/Evernote comparison response.
// ---------------------------------------------------------------------
{
  const raw = `結論から言うと、**「どちらが優れているか」はあなたの使い方（目的）によって全く異なります。**

以下に、それぞれの強み・弱み、選ぶための基準をわかりやすく比較しました。

### 1. 主な違いの比較表

| 項目 | Notion | Evernote |
| :--- | :--- | :--- |
| **コンセプト** | ノート、タスク、DBをまとめたオールインワン | 情報を素早く記録・整理・検索するノート |
| **検索機能・OCR** | 普通（テキスト検索メイン） | **最強**（手書き文字やPDF内の画像文字も検索可） |

### 2. Notionが向いている人・メリット

#### Notionの強み
1. **圧倒的なカスタマイズ性（データベース機能）**

### 3. Evernoteが向いている人・メリット

#### Evernoteの強み
1. **「検索」と「保管」が最強**`;
  const result = parseResponse(raw, "Notion", [], ["Evernote"]);
  check("early-item-with-table response: mentioned=true", result.mentioned === true);
  check(
    "early-item-with-table response: rankPosition=1 (item 0's table match, not pushed to item 1's heading)",
    result.rankPosition === 1
  );
}

// ---------------------------------------------------------------------
// Case 5 (regression guard): a table's rank column uses bare digits
// with no "位"/"#" marker at all ("| 1 | ドコモ | ... |") - confirms
// RANK_CELL's optional marker still recognizes this real shape.
// ---------------------------------------------------------------------
{
  const raw = `一番電波が良いとされるのは、**NTTドコモ**です。

### 理由と比較（2024-2025年時点の傾向）

| 順位 | 会社          | 電波の強さの評価          | 特に強いエリア             |
|------|---------------|---------------------------|----------------------------|
| 1    | **ドコモ**    | ★★★★★                    | 地方・山間部・地下・建物内 |
| 2    | **au**        | ★★★★☆                    | 地方・郊外                 |
| 3    | **ソフトバンク** | ★★★☆☆                 | 都市部                     |
| 4    | **楽天モバイル** | ★★☆☆☆                 | 都市部（4G/5G）            |`;
  const softbank = parseResponse(raw, "ソフトバンク", [], ["ドコモ", "au", "楽天モバイル"]);
  check("bare-digit rank column: ソフトバンク mentioned=true", softbank.mentioned === true);
  check("bare-digit rank column: ソフトバンク rankPosition=3 (its real table row)", softbank.rankPosition === 3);
}

console.log(`\n${pass}/${pass + fail} cases passed.`);
if (fail > 0) process.exit(1);
