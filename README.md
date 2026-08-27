# Zonostick

ChatGPT・Claude・Perplexity・Gemini における自社ブランドの推奨順位を毎朝自動計測し、
変動や異常値を Slack へ通知する GEO (Generative Engine Optimization) 追跡 SaaS の MVP です。

## 技術スタック

- Next.js 14 (App Router, TypeScript)
- Tailwind CSS + shadcn/ui 風コンポーネント
- Supabase (PostgreSQL, Auth, Row Level Security)
- Vercel Cron / Upstash QStash (日次バッチ)
- Stripe (Checkout / Webhook)
- Slack Incoming Webhook (Block Kit)

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数

`.env.example` を `.env.local` にコピーし、各値を設定してください。

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`:
  Supabase プロジェクトの Settings > API から取得
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `PERPLEXITY_API_KEY` / `GEMINI_API_KEY`:
  各社の開発者ダッシュボードから発行
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID_PRO` / `STRIPE_PRICE_ID_BUSINESS`:
  Stripe ダッシュボードから取得
- `CRON_SECRET`: 任意の長いランダム文字列。Vercel は `CRON_SECRET` を設定すると
  Cron 実行時に自動で `Authorization: Bearer <CRON_SECRET>` ヘッダーを付与します。

### 3. データベースのセットアップ

Supabase の SQL Editor で [`supabase/schema.sql`](./supabase/schema.sql) の内容を実行してください。
テーブル作成・RLS ポリシー・新規ユーザー登録時の `profiles` 自動作成トリガーまで含まれています。

Supabase Auth の設定 (Authentication > URL Configuration) で、
Site URL / Redirect URLs に `http://localhost:3000/auth/callback` および
本番ドメインの `/auth/callback` を追加してください（メールリンク認証で使用します）。

### 4. Stripe Webhook

ローカル開発では Stripe CLI を使ってフォワードします。

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

表示された Webhook Signing Secret を `STRIPE_WEBHOOK_SECRET` に設定してください。
本番では Stripe Dashboard > Developers > Webhooks でエンドポイント
`https://<your-domain>/api/webhooks/stripe` を登録し、以下のイベントを購読します。

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

### 5. 開発サーバー起動

```bash
npm run dev
```

http://localhost:3000 でランディングページ、`/login` でメールリンクログイン、
`/dashboard` でダッシュボードにアクセスできます。

## 日次バッチ (GEO計測 + Slack通知)

`app/api/cron/daily-check/route.ts` が本体です。`vercel.json` に Vercel Cron の
スケジュールを定義しています（UTC 22:00 = JST 朝7:00 に実行）。

```json
{ "crons": [{ "path": "/api/cron/daily-check", "schedule": "0 22 * * *" }] }
```

Upstash QStash を使う場合は、QStash からこのエンドポイントに
`Authorization: Bearer <CRON_SECRET>` ヘッダー付きで GET リクエストを送るようスケジュールしてください。

ローカルで動作確認する場合:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/daily-check
```

## ディレクトリ構成（主要ファイル）

```
app/
  page.tsx                        # LP
  login/page.tsx                  # メールリンクログイン
  auth/callback/route.ts          # Supabase認証コールバック
  dashboard/                      # 管理画面ダッシュボード
  api/cron/daily-check/route.ts   # 日次バッチ + 異常検知 + Slack通知
  api/checkout/route.ts           # Stripe Checkout Session作成
  api/webhooks/stripe/route.ts    # Stripe Webhook
lib/
  geo-engine.ts                   # 4大LLM並列呼び出し + 順位パースエンジン
  slack.ts                        # Slack Block Kit 通知
  stripe.ts                       # Stripeクライアント
  supabase/                       # client / server / admin クライアント
supabase/schema.sql                # DBスキーマ + RLS
```
