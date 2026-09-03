import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isSafeRedirectPath } from "@/lib/utils";

/**
 * Handles the redirect from a Supabase magic-link email: exchanges the
 * `code` query param for a session and sets the auth cookies, then
 * redirects the user into the dashboard (or wherever `next` points).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");
  // `next` now also arrives here from app/login's own `next` query
  // param (forwarded into the Google/OTP redirectTo URL) as well as
  // middleware's own same-origin-only usage - see isSafeRedirectPath's
  // comment for why an attacker-editable value has to be validated
  // here, not just trusted.
  const next = isSafeRedirectPath(rawNext) ? rawNext : "/dashboard";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    // Was previously swallowed silently, which made a real failure (e.g.
    // a PKCE code verifier cookie missing because the magic link was
    // opened in a different browser/tab than the one that requested it)
    // indistinguishable from a routine expired/reused token - logging it
    // costs nothing and is the only way to tell the two apart later.
    console.error("Auth callback code exchange failed:", error);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
