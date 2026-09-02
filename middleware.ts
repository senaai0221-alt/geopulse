import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request, protects
 * /dashboard (and /onboarding) routes by redirecting unauthenticated
 * visitors to /login, and - since there is no free tier (see
 * lib/plan-limits.ts) - sends any logged-in user without an active
 * pro/business plan to /pricing instead of letting them into either.
 * A paid account that hasn't finished the one-page setup wizard yet
 * (profiles.onboarding_completed) is sent to /onboarding instead of
 * /dashboard; the reverse redirect (a completed account trying to
 * revisit /onboarding) happens in app/onboarding/page.tsx itself, same
 * pattern as /pricing's own already-paid redirect.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const onDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const onOnboarding = request.nextUrl.pathname.startsWith("/onboarding");
  const onProtected = onDashboard || onOnboarding;

  if (!user && onProtected) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Just back from a successful Stripe Checkout: let this one request
  // through even if the webhook hasn't updated profiles.plan yet, so the
  // user doesn't get bounced back to /pricing right after paying. The
  // profiles row itself was already updated synchronously by
  // /api/checkout in the common case, and any lag resolves on the next
  // navigation regardless.
  const justPaid = request.nextUrl.searchParams.get("checkout") === "success";

  if (user && onProtected && !justPaid) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan, onboarding_completed")
      .eq("id", user.id)
      .single();

    if (profile?.plan !== "pro" && profile?.plan !== "business") {
      return NextResponse.redirect(new URL("/pricing", request.url));
    }

    // Paid, but hasn't finished the setup wizard yet - every /dashboard
    // route sends them there first (see app/onboarding/page.tsx). A
    // brand/prompt-less dashboard is a worse first five minutes than
    // being walked through setup once, up front.
    if (onDashboard && profile?.onboarding_completed !== true) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }

    // Already set up - nothing left for the wizard to do, so send a
    // direct revisit of /onboarding on to the dashboard instead.
    if (onOnboarding && profile?.onboarding_completed === true) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image optimization
     * files, so the session cookie stays fresh across the whole app.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
