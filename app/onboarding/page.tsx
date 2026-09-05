import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { T } from "@/components/t";
import { LangToggle } from "@/components/lang-toggle";
import { SignOutButton } from "@/app/dashboard/sign-out-button";
import { OnboardingWizard } from "./onboarding-wizard";

// Runs the newly-created prompts' first-time measurement checks in
// parallel and awaits all of them before redirecting (see actions.ts) -
// bounded by the single slowest prompt's own REQUEST_TIMEOUT_MS
// (55s, see lib/geo-engine.ts), not their sum, but still needs real
// headroom beyond a typical route's default. Matches check-now's own
// route.ts maxDuration.
export const maxDuration = 60;

/**
 * The mandatory one-page setup wizard between subscribing and the real
 * dashboard - middleware.ts sends any paid account with
 * profiles.onboarding_completed still false here instead of /dashboard.
 * Mirrors /pricing's own structure: a plain, sidebar-free page (no
 * DashboardLayout - nothing to navigate to yet) that re-checks the same
 * conditions middleware already did, as a defense-in-depth backstop
 * rather than trusting the redirect alone.
 */
export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, onboarding_completed")
    .eq("id", user.id)
    .single();

  if (profile?.plan !== "pro" && profile?.plan !== "business") {
    redirect("/pricing");
  }

  if (profile?.onboarding_completed === true) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col bg-muted/40">
      <header className="border-b border-border bg-background">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Zonostick
          </Link>
          <div className="flex items-center gap-3">
            <LangToggle />
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="container flex flex-1 justify-center py-10">
        <div className="w-full max-w-2xl">
          <div className="mb-8 text-center">
            <h1 className="text-balance break-keep text-2xl font-bold tracking-tight sm:text-3xl">
              <T k="onboarding.title" />
            </h1>
            <p className="mt-3 text-balance break-keep text-sm text-muted-foreground sm:text-base">
              <T k="onboarding.subtitle" />
            </p>
          </div>

          <OnboardingWizard />
        </div>
      </div>
    </main>
  );
}
