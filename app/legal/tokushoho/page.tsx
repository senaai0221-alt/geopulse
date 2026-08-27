import Link from "next/link";
import { Sparkles } from "lucide-react";

export const metadata = {
  title: "特定商取引法に基づく表示 | Zonostick",
};

const ROWS: { label: string; value: React.ReactNode }[] = [
  { label: "販売業者", value: "株式会社ENDEVER" },
  { label: "運営統括責任者", value: "前園祐紀" },
  { label: "所在地", value: "東京都港区港南1-9-36 アレア品川13F" },
  {
    label: "電話番号",
    value: "ご請求をいただいた場合には、遅滞なく開示いたします。",
  },
  {
    label: "メールアドレス",
    value: (
      <a href="mailto:maesono@endever.co.jp" className="text-primary underline underline-offset-2">
        maesono@endever.co.jp
      </a>
    ),
  },
  {
    label: "販売価格",
    value: (
      <>
        Free: ¥0 / 月<br />
        Pro: ¥9,800(税込)/ 月<br />
        Business: ¥29,800(税込)/ 月<br />
        ※詳細は
        <Link href="/#pricing" className="text-primary underline underline-offset-2">
          料金プランページ
        </Link>
        をご確認ください。
      </>
    ),
  },
  { label: "商品代金以外の必要料金", value: "ございません。" },
  {
    label: "お支払い方法",
    value: "クレジットカード決済(Stripe社の決済システムを利用しています)",
  },
  {
    label: "お支払い時期",
    value:
      "お申込み手続き完了時に初回のお支払いが発生し、以降は毎月同日に自動更新・自動課金されます。",
  },
  {
    label: "サービスの提供時期",
    value: "お支払い手続き完了後、直ちにご利用いただけます。",
  },
  {
    label: "返品・キャンセルについて",
    value:
      "本サービスはデジタルサービスの性質上、提供開始後の返金・返品はお受けしておりません。ただし、法令上返金対応が必要と判断される場合は、この限りではありません。解約はいつでもマイページから手続き可能で、解約後は次回更新日以降の課金が停止します。",
  },
  {
    label: "動作環境",
    value: "インターネットに接続されたWebブラウザからご利用いただけます。特別なソフトウェアのインストールは不要です。",
  },
];

export default function TokushohoPage() {
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
        <h1 className="text-3xl font-bold tracking-tight">特定商取引法に基づく表示</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          特定商取引に関する法律第11条に基づき、以下のとおり表示します。
        </p>

        <dl className="mt-10 divide-y divide-border rounded-lg border border-border">
          {ROWS.map((row) => (
            <div key={row.label} className="grid grid-cols-1 gap-1 p-5 sm:grid-cols-3 sm:gap-4">
              <dt className="text-sm font-medium text-muted-foreground">{row.label}</dt>
              <dd className="text-sm sm:col-span-2">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </main>
  );
}
