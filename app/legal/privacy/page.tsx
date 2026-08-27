import Link from "next/link";
import { Sparkles } from "lucide-react";

export const metadata = {
  title: "プライバシーポリシー | GEOPulse",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            GEOPulse
          </Link>
        </div>
      </header>

      <div className="container max-w-3xl py-16">
        <h1 className="text-3xl font-bold tracking-tight">プライバシーポリシー</h1>
        <p className="mt-3 text-sm text-muted-foreground">最終改定日: 2026年8月27日</p>

        <div className="mt-10 flex flex-col gap-8 text-sm leading-relaxed [&_h2]:mb-3 [&_h2]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_ol]:flex [&_ol]:list-decimal [&_ol]:flex-col [&_ol]:gap-2 [&_ol]:pl-5 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5 [&_p]:text-muted-foreground">
          <p className="text-muted-foreground">
            株式会社ENDEVER(以下「当社」といいます)は、当社が提供する「GEOPulse」(以下「本サービス」といいます)における、ユーザーの個人情報の取り扱いについて、以下のとおりプライバシーポリシー(以下「本ポリシー」といいます)を定めます。
          </p>

          <section>
            <h2>第1条(取得する情報)</h2>
            <p>当社は、本サービスの提供にあたり、以下の情報を取得します。</p>
            <ul>
              <li>メールアドレス(アカウント登録・ログインのため)</li>
              <li>ユーザーが登録したブランド名、競合名、追跡プロンプトの内容</li>
              <li>決済に関する情報(クレジットカード情報そのものは当社では保持せず、決済代行会社であるStripe社が管理します)</li>
              <li>Slack Incoming Webhook URL(通知機能をご利用の場合)</li>
              <li>アクセスログ、Cookie等の技術的情報</li>
            </ul>
          </section>

          <section>
            <h2>第2条(利用目的)</h2>
            <p>取得した情報は、以下の目的で利用します。</p>
            <ul>
              <li>本サービスの提供、維持、改善のため</li>
              <li>ユーザー認証、本人確認のため</li>
              <li>料金請求、決済処理のため</li>
              <li>ユーザーからのお問い合わせへの対応のため</li>
              <li>利用規約に違反する行為への対応のため</li>
              <li>本サービスに関する重要なお知らせの通知のため</li>
            </ul>
          </section>

          <section>
            <h2>第3条(第三者への提供・外部送信)</h2>
            <p>
              当社は、以下の外部サービスに必要な範囲で情報を送信します。各社のプライバシーポリシーもあわせてご確認ください。
            </p>
            <ul>
              <li>Supabase(データベース・認証基盤)</li>
              <li>OpenAI、Anthropic、Perplexity、Google(登録されたプロンプトの実行のため、プロンプト文とブランド名・競合名を送信します)</li>
              <li>Stripe(決済処理のため)</li>
              <li>Resend(ログイン用メールの送信のため)</li>
              <li>Vercel(アプリケーションのホスティングのため)</li>
            </ul>
            <p>
              上記の場合を除き、当社は、法令に基づく場合を除いて、ユーザーの同意なく個人情報を第三者に提供することはありません。
            </p>
          </section>

          <section>
            <h2>第4条(データの保管期間)</h2>
            <p>
              当社は、ユーザーがアカウントを保持する期間中、取得した情報を保管します。ユーザーがアカウントの削除を希望する場合は、第6条のお問い合わせ先までご連絡ください。合理的な期間内に削除対応いたします。
            </p>
          </section>

          <section>
            <h2>第5条(安全管理措置)</h2>
            <p>
              当社は、取得した情報の漏えい、滅失またはき損の防止その他の安全管理のために、Row Level Security(行レベルセキュリティ)の適用、通信の暗号化(HTTPS)等、必要かつ適切な措置を講じます。
            </p>
          </section>

          <section>
            <h2>第6条(お問い合わせ窓口)</h2>
            <p>
              本ポリシーに関するお問い合わせ、開示・訂正・削除等のご請求は、下記までご連絡ください。
            </p>
            <p>
              株式会社ENDEVER
              <br />
              東京都港区港南1-9-36 アレア品川13F
              <br />
              電子メール:{" "}
              <a href="mailto:maesono@endever.co.jp" className="text-primary underline underline-offset-2">
                maesono@endever.co.jp
              </a>
            </p>
          </section>

          <section>
            <h2>第7条(本ポリシーの変更)</h2>
            <p>
              当社は、必要と判断した場合には、ユーザーに通知することなく本ポリシーを変更することがあります。変更後の内容は、本サービス上に表示した時点より効力を生じるものとします。
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
