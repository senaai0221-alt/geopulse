"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn, isSafeRedirectPath } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineAlert } from "@/components/ui/inline-alert";
import { LangToggle } from "@/components/lang-toggle";
import { useI18n } from "@/lib/i18n/context";

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

type Mode = "login" | "signup";

/**
 * There is no functional difference between "logging in" and "signing
 * up" in this app - Google OAuth and the email OTP link both
 * transparently create an account on first use, so `mode` only ever
 * changes copy/emphasis, never which fields or requests run. Anything
 * other than the literal string "login" defaults to "signup" - the
 * framing already used everywhere else on the marketing page's own
 * primary CTAs ("今すぐ始める"/getStarted), so a bare `/login` visit
 * with no `mode` at all reads the same way those already do.
 */
function readMode(searchParams: URLSearchParams): Mode {
  return searchParams.get("mode") === "login" ? "login" : "signup";
}

export function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<Mode>(() => readMode(searchParams));

  // Where to send the browser after a successful sign-in, beyond the
  // default /dashboard - e.g. "/pricing?plan=pro" when this page was
  // reached from a specific plan's CTA on the marketing page, so
  // clicking "Pro" and logging in lands directly back on that same
  // plan instead of a generic plan list. Re-validated with the exact
  // same same-origin-only check app/auth/callback applies before ever
  // actually redirecting anywhere - see isSafeRedirectPath's comment.
  const rawNext = searchParams.get("next");
  const next = isSafeRedirectPath(rawNext) ? rawNext : null;

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  // Supabase's own (English, untranslatable) failure message - kept
  // separate from emailValidationError below so the two can't collide.
  const [error, setError] = useState<string | null>(null);
  // Our own pre-send "required" check, stored as an i18n key rather than
  // an already-translated string, and translated at render time (see
  // emailAlertText) - so switching the JA/EN toggle while it's showing
  // re-translates it immediately instead of leaving stale-language text.
  const [emailValidationError, setEmailValidationError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [codeValidationError, setCodeValidationError] = useState<string | null>(null);

  const emailAlertText = emailValidationError ? t(emailValidationError) : error;
  const codeAlertText = codeValidationError ? t(codeValidationError) : verifyError;

  // Switches the tab instantly (no navigation/reload) while still
  // reflecting the choice in the URL - via replace, not push, so
  // toggling back and forth doesn't fill up the back-button history -
  // so refreshing or sharing the link preserves whichever tab was
  // showing.
  function selectMode(next: Mode) {
    setMode(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", next);
    router.replace(`/login?${params.toString()}`, { scroll: false });
  }

  function buildCallbackUrl(): string {
    const url = new URL("/auth/callback", window.location.origin);
    if (next) url.searchParams.set("next", next);
    return url.toString();
  }

  async function handleGoogleSignIn() {
    setGoogleError(null);
    setGoogleLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: buildCallbackUrl(),
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
    setError(null);
    setEmailValidationError(null);

    // The form is `noValidate` (see below) so this check - not the
    // browser's native validation bubble - is what runs on an empty
    // email: a native bubble draws in the browser's own UI language, not
    // the app's locale, which reads as untranslated text leaking through
    // in EN mode.
    if (!email.trim()) {
      setEmailValidationError("validation.required");
      return;
    }
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: buildCallbackUrl(),
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
    setVerifyError(null);
    setCodeValidationError(null);

    if (!code.trim()) {
      setCodeValidationError("validation.required");
      return;
    }
    setVerifying(true);

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
      // dashboard render wider than the screen after OTP sign-in. `next`
      // gets the same treatment here as everywhere else it's consumed -
      // the OTP verify step never goes through /auth/callback at all
      // (verifyOtp establishes the session directly), so this is the
      // one place that has to apply it itself.
      window.location.href = next ?? "/dashboard";
    }
  }

  return (
    <main className="min-h-app flex flex-col bg-gradient-to-b from-primary/[0.06] via-background to-muted/40 px-4">
      <div className="flex justify-end pt-4">
        <LangToggle />
      </div>
      <div className="flex flex-1 items-center justify-center py-6">
        <Card className="w-full max-w-md shadow-lg shadow-primary/5">
          <CardHeader className="items-center gap-1 text-center">
            <Link href="/" className="mb-3 flex items-center gap-2 text-xl font-bold">
              <Sparkles className="h-6 w-6 text-primary" />
              Zonostick
            </Link>
            <CardTitle>{mode === "login" ? t("login.titleLogin") : t("login.titleSignup")}</CardTitle>
            <CardDescription>
              {mode === "login" ? t("login.subtitleLogin") : t("login.subtitleSignup")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!sent && (
              // Switching tabs never re-sends anything or changes which
              // fields exist below - see readMode's own comment on why
              // login and signup are the same flow here. Hidden once a
              // code has been sent: switching framing mid-verification
              // doesn't mean anything and would just discard progress.
              <div className="mb-4 flex gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => selectMode("login")}
                  className={cn(
                    "flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors",
                    mode === "login"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t("login.tabLogin")}
                </button>
                <button
                  type="button"
                  onClick={() => selectMode("signup")}
                  className={cn(
                    "flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors",
                    mode === "signup"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t("login.tabSignup")}
                </button>
              </div>
            )}
            {sent ? (
              <div className="flex flex-col gap-4">
                {error ? (
                  <div className="rounded-md bg-amber-50 p-4 text-center text-sm text-amber-800">
                    {t("login.sendFailed")}
                  </div>
                ) : (
                  <div className="rounded-md bg-emerald-50 p-4 text-center text-sm text-emerald-800">
                    {email} {t("login.linkSent")}
                  </div>
                )}
                <form onSubmit={handleVerifyCode} noValidate className="flex flex-col gap-2">
                  <Label htmlFor="code">
                    {error ? t("login.enterCode") : t("login.enterCodeHint")}
                  </Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    placeholder="12345678"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                  {codeAlertText && <InlineAlert>{codeAlertText}</InlineAlert>}
                  <Button type="submit" disabled={verifying} className="w-full">
                    {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t("login.confirmCode")}
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
                  {mode === "login" ? t("login.googleSignIn") : t("login.googleSignInSignup")}
                </Button>
                {googleError && <InlineAlert>{googleError}</InlineAlert>}

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">{t("login.or")}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="email">{t("login.email")}</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  {emailAlertText && <InlineAlert>{emailAlertText}</InlineAlert>}
                  <Button type="submit" variant="secondary" disabled={loading} className="w-full">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {mode === "login" ? t("login.sendLink") : t("login.sendLinkSignup")}
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
            {t("login.terms")}
          </Link>
          <span aria-hidden="true">|</span>
          <Link href="/legal/privacy" className="hover:text-foreground">
            {t("login.privacy")}
          </Link>
        </div>
        <p>&copy; {new Date().getFullYear()} Zonostick</p>
      </footer>
    </main>
  );
}
