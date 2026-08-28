"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);
    if (error) {
      // Supabase still issues a verifiable OTP even when it fails to
      // deliver the email (e.g. sandbox SMTP sender restrictions), so
      // let the user proceed to code entry rather than blocking them.
      setError(error.message);
    }
    setSent(true);

    // Some mobile in-app browsers (e.g. LINE's WebView) don't recompute
    // the page's zoom/scale after the on-screen keyboard closes and the
    // form is swapped out for the code-entry screen, which makes the
    // card render wider than the viewport. Blurring the focused input
    // and forcing a scroll reset nudges those browsers into recalculating
    // the layout correctly.
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setVerifyError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });

    setVerifying(false);
    if (error) {
      setVerifyError(error.message);
    } else {
      // Force a full page load (rather than a client-side router
      // transition) so the destination page starts from a clean slate -
      // some mobile browsers keep the previous page's zoom/viewport
      // state across a client-side navigation, which made the
      // dashboard render wider than the screen after OTP sign-in.
      window.location.href = "/dashboard";
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-muted/40 px-4 pb-12 pt-14 sm:justify-center sm:pt-4">
      <Card className="w-full max-w-md shadow-lg shadow-primary/5">
        <CardHeader className="items-center gap-1 text-center">
          <Link href="/" className="mb-3 flex items-center gap-2 text-xl font-bold">
            <Sparkles className="h-6 w-6 text-primary" />
            Zonostick
          </Link>
          <CardTitle>ログイン / 新規登録</CardTitle>
          <CardDescription>
            メールアドレスにログインリンクを送信します（パスワード不要）
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="flex flex-col gap-4">
              {error ? (
                <div className="rounded-md bg-amber-50 p-4 text-center text-sm text-amber-800">
                  メールの送信に失敗しました。お手元にログインコードがあれば、下に入力してログインできます。
                </div>
              ) : (
                <div className="rounded-md bg-emerald-50 p-4 text-center text-sm text-emerald-800">
                  {email} 宛にログインリンクを送信しました。メールをご確認ください。
                </div>
              )}
              <form onSubmit={handleVerifyCode} className="flex flex-col gap-2">
                <Label htmlFor="code">
                  {error ? "ログインコードを入力" : "またはメール内の8桁コードを入力"}
                </Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  placeholder="12345678"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                {verifyError && <p className="text-sm text-destructive">{verifyError}</p>}
                <Button type="submit" disabled={verifying} className="w-full">
                  {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  コードを確認
                </Button>
              </form>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">メールアドレス</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                ログインリンクを送信
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
