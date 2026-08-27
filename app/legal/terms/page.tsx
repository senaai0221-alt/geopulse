import Link from "next/link";
import { Sparkles } from "lucide-react";

export const metadata = {
  title: "利用規約 | Zonostick",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Zonostick
          </Link>
        </div>
      </header>

      <div className="container max-w-3xl py-16">
        <h1 className="text-3xl font-bold tracking-tight">利用規約</h1>
        <p className="mt-3 text-sm text-muted-foreground">最終改定日: 2026年8月27日</p>

        <div className="mt-10 flex flex-col gap-8 text-sm leading-relaxed [&_h2]:mb-3 [&_h2]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_ol]:flex [&_ol]:list-decimal [&_ol]:flex-col [&_ol]:gap-2 [&_ol]:pl-5 [&_p]:text-muted-foreground">
          <section>
            <h2>第1条(適用)</h2>
            <p>
              本規約は、株式会社ENDEVER(以下「当社」といいます)が提供するGEO(生成エンジン最適化)追跡サービス「Zonostick」(以下「本サービス」といいます)の利用条件を定めるものです。ユーザーは、本サービスを利用することにより、本規約の内容に同意したものとみなされます。
            </p>
          </section>

          <section>
            <h2>第2条(アカウント登録)</h2>
            <ol>
              <li>本サービスの利用を希望する方は、本規約に同意の上、当社の定める方法により利用登録を申請するものとします。</li>
              <li>登録情報に虚偽、誤記または記載漏れがあった場合、当社は当該登録の全部または一部を取り消すことができるものとします。</li>
            </ol>
          </section>

          <section>
            <h2>第3条(料金及び支払い)</h2>
            <ol>
              <li>ユーザーは、本サービスの有料プランを利用する場合、当社が別途定め、本サービス上に表示する利用料金を、当社が指定する方法により支払うものとします。</li>
              <li>有料プランは、契約期間満了時に自動的に同一条件で更新されるものとし、ユーザーが更新の希望をしない場合は、次回更新日の前日までに当社所定の方法により解約手続きを行うものとします。</li>
              <li>ユーザーの都合による中途解約であっても、既にお支払いいただいた料金は原則として返金いたしません。</li>
            </ol>
          </section>

          <section>
            <h2>第4条(禁止事項)</h2>
            <p>ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません。</p>
            <ol>
              <li>法令または公序良俗に違反する行為</li>
              <li>当社、他のユーザーまたは第三者の知的財産権、肖像権、プライバシー等の権利を侵害する行為</li>
              <li>本サービスのサーバーやネットワークの機能を破壊・妨害する行為</li>
              <li>本サービスによって得られた情報を、本サービスの利用目的を超えて複製、販売、公開する行為</li>
              <li>その他、当社が不適切と判断する行為</li>
            </ol>
          </section>

          <section>
            <h2>第5条(外部サービスとの連携)</h2>
            <p>
              本サービスは、OpenAI、Anthropic、Perplexity、Google等が提供するAIサービスのAPIを利用して情報を取得します。これらの外部サービスの応答内容の正確性について、当社は保証するものではありません。また、外部サービスの仕様変更、提供終了、障害等により本サービスの機能の一部が利用できなくなる場合があります。
            </p>
          </section>

          <section>
            <h2>第6条(免責事項)</h2>
            <ol>
              <li>当社は、本サービスが提供する情報(AIによる回答の解析結果、順位情報等を含む)の完全性、正確性、有用性等について、いかなる保証も行いません。</li>
              <li>当社は、本サービスに起因してユーザーに生じたあらゆる損害について、当社の故意または重過失による場合を除き、一切の責任を負いません。</li>
              <li>当社は、本サービスの内容を予告なく変更、追加または廃止することがあります。</li>
            </ol>
          </section>

          <section>
            <h2>第7条(利用停止・退会)</h2>
            <p>
              当社は、ユーザーが本規約に違反したと認めた場合、事前の通知なく、本サービスの利用を停止し、またはアカウントを削除することができるものとします。
            </p>
          </section>

          <section>
            <h2>第8条(規約の変更)</h2>
            <p>
              当社は、必要と判断した場合には、ユーザーに通知することなく本規約を変更できるものとします。変更後の規約は、本サービス上に表示した時点より効力を生じるものとします。
            </p>
          </section>

          <section>
            <h2>第9条(準拠法・管轄裁判所)</h2>
            <p>
              本規約の解釈にあたっては日本法を準拠法とします。本サービスに関して紛争が生じた場合には、東京地方裁判所を第一審の専属的合意管轄裁判所とします。
            </p>
          </section>

          <section>
            <h2>第10条(お問い合わせ)</h2>
            <p>
              本規約に関するお問い合わせは、
              <a href="mailto:maesono@endever.co.jp" className="text-primary underline underline-offset-2">
                maesono@endever.co.jp
              </a>
              までご連絡ください。
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
