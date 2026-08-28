"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...props}>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.5 0 10.4-2.1 14.1-5.6l-6.5-5.5C29.5 34.6 26.9 35.5 24 35.5c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5c3.4 6.6 10.1 11.4 17.8 11.4z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.2 5.6l6.5 5.5C40.9 36.6 44 30.9 44 24c0-1.3-.1-2.7-.4-3.5z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setGoogleError(null);
    setGoogleLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    // On success the browser is redirected to Google immediately, so this
    // only runs when the request itself failed to start.
    if (error) {
      setGoogleLoading(false);
      setGoogleError(error.message);
    }
  }

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
    <main className="min-h-app flex flex-col bg-gradient-to-b from-primary/[0.06] via-background to-muted/40 px-4">
      <div className="flex flex-1 items-center justify-center py-10">
        <Card className="w-full max-w-md shadow-lg shadow-primary/5">
          <CardHeader className="items-center gap-1 text-center">
            <Link href="/" className="mb-3 flex items-center gap-2 text-xl font-bold">
              <Sparkles className="h-6 w-6 text-primary" />
              Zonostick
            </Link>
            <CardTitle>ログイン / 新規登録</CardTitle>
            <CardDescription>
              Googleアカウント、またはメールアドレスでログインできます
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
              <div className="flex flex-col gap-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={googleLoading}
                  onClick={handleGoogleSignIn}
                  className="w-full gap-2"
                >
                  {googleLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <GoogleIcon className="h-4 w-4" />
                  )}
                  Googleでログイン
                </Button>
                {googleError && <p className="text-sm text-destructive">{googleError}</p>}

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">または</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

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
                  <Button type="submit" variant="secondary" disabled={loading} className="w-full">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    ログインリンクを送信
                  </Button>
                </form>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <footer className="flex flex-col items-center gap-1 pb-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Link href="/legal/terms" className="hover:text-foreground">
            利用規約
          </Link>
          <span aria-hidden="true">|</span>
          <Link href="/legal/privacy" className="hover:text-foreground">
            プライバシーポリシー
          </Link>
        </div>
        <p>&copy; {new Date().getFullYear()} Zonostick</p>
      </footer>
    </main>
  );
}
