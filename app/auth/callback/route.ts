import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Handles the redirect from a Supabase magic-link email: exchanges the
 * `code` query param for a session and sets the auth cookies, then
 * redirects the user into the dashboard (or wherever `next` points).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

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
