# DESIGN.md — Zonostick

> Zonostick（GEO / Generative Engine Optimization 計測SaaS）のデザイン仕様書。
> `app/globals.css`・`tailwind.config.ts`・`components/ui/*`（shadcn/ui ベース）の実装値から抽出。
> タイポグラフィ・親しみやすさの思想は [awesome-design-md-jp](https://github.com/kzhrknt/awesome-design-md-jp) の
> [freee DESIGN.md](https://github.com/kzhrknt/awesome-design-md-jp/blob/main/design-md/freee/DESIGN.md) を参考に、
> Zonostick 自身のブランドカラー（indigo）を維持したまま採用（2026-09 改訂）。

---

## 1. Visual Theme & Atmosphere

- **デザイン方針**: 「AIが自社ブランドをどう推奨しているか」という抽象的でとっつきにくいテーマを、明快で親しみやすいダッシュボードとして提供する。freee の「複雑な業務を、直感的で軽やかなUIで見せる」という思想を踏襲
- **密度**: ダッシュボード（表・チャート中心）は中程度の情報密度。LP・料金ページはゆったりとした余白
- **キーワード**: 明快、信頼性、データドリブン、親しみやすい、静かな自信（けばけばしくない）
- **特徴**: indigo を基調としたクリーンな配色。6大LLM（ChatGPT/Claude/Perplexity/Gemini/Grok/DeepSeek）ごとに固定の識別カラーを持つ

---

## 2. Color Palette & Roles

### Primary（ブランドカラー）

- **Primary** (`#4f46e5` / `hsl(243 75% 59%)`, Tailwind `indigo-600`): CTAボタン、リンク、アクティブ状態、フォーカスリング
- **Primary Hover** (`indigo-700`): ボタンホバー時（`hover:bg-indigo-700` — トークンの透過ではなく実色を使用。「押した感」が出るため）

### Semantic（意味的な色）

- **Destructive** (`hsl(0 84% 60%)`): エラー、削除、バリデーションエラー
- **Success** (`emerald-100` bg / `emerald-800` text): 成功バッジ
- **Warning** (`amber-100` bg / `amber-800` text, `amber-500` アイコン): 警告アラート（rank下落など）

### Neutral（ニュートラル・shadcn token）

- **Foreground** (`hsl(222 47% 11%)`): 見出し・本文
- **Muted Foreground** (`hsl(215 16% 47%)`): 補助テキスト、キャプション、非アクティブタブ
- **Background** (`hsl(0 0% 100%)`): ページ背景
- **Border** (`hsl(214 32% 91%)` ≒ `slate-200`): 罫線・カード枠
- **Input Border** (`hsl(213 27% 84%)` ≒ `slate-300`): フォーム入力欄の枠（border よりわずかに濃く、操作可能要素と明確に区別）

> **Don't**: テキストに純粋な `#000000` を使わない。必ず `text-foreground`（`hsl(222 47% 11%)`）を使う。

### LLMプロバイダー識別カラー（固定・絶対に循環させない）

チャート・バッジ全体で共通。`components/rank-trend-chart.tsx` が正本。

| Provider | Color |
|---|---|
| ChatGPT | `#2a78d6` |
| Claude | `#eb6834` |
| Perplexity | `#1baf7a` |
| Gemini | `#eda100` |
| Grok | `#e87ba4` |
| DeepSeek | `#008300` |

---

## 3. Typography Rules

### 3.1 方針（2026-09 改訂・freee 参考）

freee はプロダクトUIとコーポレートサイトで戦略を分けているが、Zonostick は認証必須（無料プランなし）でダッシュボードの利用時間がLPより圧倒的に長いため、**全画面で単一のシステムフォントスタック**を採用する（Webフォント読み込みを避け、freee の「プロダクトUI」戦略を全面適用）。

**改訂前の問題**: Tailwind のデフォルト `font-sans`（`ui-sans-serif, system-ui, ...`)には和文フォールバックが一切なく、日本語テキストがブラウザ依存の不揃いなフォントで表示されていた。Zonostick は英語デフォルト・日本語自動検出のバイリンガル製品（`lib/i18n/context.tsx`）であるため、和文フォールバックの欠落は実害があった。

### 3.2 font-family 指定（新規）

```css
font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial,
  "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", Meiryo,
  sans-serif;
```

- 欧文フォントを和文フォントより先に指定（英語がデフォルトロケールのため、欧文の表示品質を優先— freee と同じ考え方）
- macOS: `-apple-system` → `Hiragino Kaku Gothic ProN`
- Windows: `Arial` → `Yu Gothic` → `Meiryo`
- `tailwind.config.ts` の `theme.extend.fontFamily.sans` に設定し、`font-sans`（Tailwind のデフォルトクラス）で全画面に適用

### 3.3 文字サイズ・ウェイト階層（実測・既存コンポーネントより）

| Role | Class | Size | Weight | 用途 |
|---|---|---|---|---|
| Hero H1 | `text-4xl sm:text-5xl` | 36–48px | `font-bold` (700) | LP ヒーロー見出し |
| Section H2 | `text-3xl` | 30px | `font-bold` | セクション見出し |
| Card Title | `text-lg` / `font-semibold` | 18px | 600 | カードヘッダー |
| Body | `text-sm` | 14px | 400 | ダッシュボード本文・表 |
| Caption | `text-xs` | 12px | 400〜500 | バッジ、ラベル、キャプション |

> 見出しは `font-bold`（700）を基本とする（freee の 500 ではなく、既存実装のまま維持 — データ製品として数値・見出しの視認性を優先）。

### 3.4 行間・字間

- **行間**: 全体で Tailwind デフォルト（`leading-normal` ≒ 1.5）を維持。freee のプロダクトUI戦略（"すべて 1.5 で統一"）と一致するため変更不要
- **字間**: 現状 `tracking-*` は未使用（デフォルト＝ `0`）。大見出し（`text-3xl` 以上）にのみ、freee に倣い `tracking-tight`（-0.025em、Tailwind標準）を新たに適用し、大きな和欧混植見出しの間延び感を抑える
- ラベル・アップサーケースの短い英語表記（例: バッジの `PRO`）には `tracking-wide` を許容

### 3.5 禁則処理・改行ルール

```css
overflow-wrap: break-word;
```

- 長いURL・プロンプト文字列がテーブルセルからはみ出さないよう、該当コンポーネントは個別に `break-all`/`truncate` を適用済み（例: `app/dashboard/page.tsx` のプロンプトセル）
- 特別な禁則処理（`text-wrap: balance` 等）は見出しの改行位置調整にのみ限定的に使用

---

## 4. Component Stylings

### Buttons（`components/ui/button.tsx`）

- **Default（Primary）**: `bg-primary text-primary-foreground shadow-sm hover:bg-indigo-700`
- **Outline**: `border border-input bg-background hover:bg-accent`
- **Radius**: `rounded-md`（`calc(var(--radius) - 2px)` = 10px）
- **Size**: `sm` = h-9, `default` = h-10, `lg` = h-11

### Inputs（`components/ui/input.tsx`）

- Border: `border-input`（slate-300 相当）
- Radius: `rounded-md`
- Font size: `text-base`（16px、モバイルでのiOS自動ズーム防止のため `text-sm` にしない）

### Cards（`components/ui/card.tsx`）

- Background: `bg-card`（白）
- Border: `border-slate-200/80`
- Radius: `rounded-lg`（`var(--radius)` = 12px）
- Shadow: `shadow-sm`

### Badges（`components/ui/badge.tsx`）

- Radius: `rounded-full`（ピル型 — freee のプロダクトUI戦略と同じ思想）
- Variants: `default`(primary) / `secondary` / `destructive` / `outline` / `success`（emerald）/ `warning`（amber）

---

## 5. Layout Principles

### Spacing

Tailwind デフォルトスケール（4px刻み: `gap-1`=4px, `gap-2`=8px, `gap-4`=16px, `gap-6`=24px...）を一貫して使用。個別 `margin` の手書きは避け、`flex`/`grid` の `gap` で親が子の間隔を制御する（`artifact-design` スキルの原則にも合致）。

### Container

- 中央寄せ、`padding: 1.5rem`
- `2xl` ブレークポイント（1536px〜）のみ `max-width: 1600px` に制限（`tailwind.config.ts`）。一般的な1280pxでは広いモニタで余白が持て余すため拡張済み

### Border Radius Scale

| Token | Value | 用途 |
|---|---|---|
| `--radius` | 0.75rem (12px) | Card |
| `rounded-md` | 0.625rem (10px) | Button, Input |
| `rounded-full` | — | Badge, タブ切替のアクティブピル |

---

## 6. Depth & Elevation

| Level | Class | 用途 |
|---|---|---|
| Card | `shadow-sm` | 標準カード |
| Highlighted Card | `shadow-lg ring-1 ring-primary` | おすすめプラン、選択中プランのカード |
| Login Card | `shadow-lg shadow-primary/5` | ログインカード（ブランドカラーの淡い滲み） |

- Transition: `transition-colors`（インタラクティブ要素のホバー）

---

## 7. Do's and Don'ts

### Do（推奨）

- 全画面でシステムフォントスタック（§3.2）を使い、Webフォントの読み込みを避ける
- テキスト色は必ずトークン経由（`text-foreground` / `text-muted-foreground`）。生の `#000000`・`#fff` を直書きしない
- LLMプロバイダーの識別色は固定順・固定色（§2）を厳守し、フィルタ等で入れ替わっても色を使い回さない（`rank-trend-chart.tsx` の既存原則）
- ステータス（成功/警告/危険）は色だけでなくアイコン・ラベルも併用する
- スペーシングは 4px の倍数（Tailwind標準ユーティリティ）に揃える

### Don't（禁止）

- ブランドカラー `#4f46e5` の上に暗い色のテキストを置かない（`text-primary-foreground` = 白を使う）
- 見出し・アラート判定に使う数値（順位・スコア）を LLM の主観的判断だけで決めない（`lib/geo-engine.ts` の既存設計原則 — デザインではなくロジックの原則だが、UI表示の信頼性に直結するためここにも明記）
- カテゴリ性の高い装飾（連番マーカー 01/02/03 など）を、実際に順序・手順を表さない箇所に使わない

---

## 8. Responsive Behavior

### Breakpoints（Tailwind デフォルト + 拡張）

| Name | Width |
|---|---|
| `sm` | 640px |
| `md` | 768px |
| `lg` | 1024px |
| `xl` | 1280px |
| `2xl`（拡張） | 1600px |

### モバイル対応

- `input`/`textarea`/`select` は 768px 以下で `font-size: 16px !important`（iOS Safari の自動ズーム防止、`app/globals.css`）
- ダッシュボードのサイドバーはモバイルでハンバーガーメニューに切り替え（`components/mobile-nav`）

---

## 9. Agent Prompt Guide

### クイックリファレンス

```
Primary: #4f46e5 (indigo-600)
Primary Hover: indigo-700
Text (heading/body): hsl(222 47% 11%)  — Tailwind: text-foreground
Text (muted/caption): hsl(215 16% 47%) — Tailwind: text-muted-foreground
Background: #ffffff
Border: hsl(214 32% 91%) ≒ slate-200
Destructive: hsl(0 84% 60%)
Success: emerald-100 / emerald-800
Warning: amber-100 / amber-800

Font stack (全画面共通):
-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial,
"Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif

Line Height: 1.5（全体統一）
Heading Weight: 700（bold）
Large heading tracking: tracking-tight（text-3xl以上）
Button/Input Radius: rounded-md (10px)
Card Radius: rounded-lg (12px, var(--radius))
Badge Radius: rounded-full
```

### プロンプト例

```
Zonostick のダッシュボード風に、新しいカード型ウィジェットを作成してください。
- フォント: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial,
  "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif
- テキスト色: text-foreground（見出し・本文）、text-muted-foreground（補助）
- カード: bg-card, border border-slate-200/80, rounded-lg, shadow-sm
- プライマリボタン: bg-primary text-primary-foreground, rounded-md, hover:bg-indigo-700
- スペーシング: gap-4 / gap-6 など 4px 刻み
- ステータス表示は色だけでなくアイコン + ラベルを併用する
```
