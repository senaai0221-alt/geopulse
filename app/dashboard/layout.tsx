import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { T } from "@/components/t";
import { LangToggle } from "@/components/lang-toggle";
import { SignOutButton } from "./sign-out-button";
import { SidebarNav } from "./sidebar-nav";
import { DashboardLogoLink } from "./logo-link";
import { MobileNav } from "./mobile-nav";
import { UnsavedChangesProvider } from "./unsaved-changes-context";

const PLAN_LABELS: Record<string, string | null> = {
  free: null, // rendered via <T k="dashboard.notSubscribed" /> instead
  pro: "Pro",
  business: "Business",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, plan")
    .eq("id", user.id)
    .single();
  const planLabel = PLAN_LABELS[profile?.plan ?? "free"] ?? profile?.plan ?? null;

  return (
    <UnsavedChangesProvider>
      <div className="min-h-screen bg-muted/50 print:bg-background">
        <header className="border-b border-border bg-background print:hidden">
          <div className="container flex h-16 items-center justify-between gap-3">
            {/* Inside the logged-in app, the logo stays inside the app
                (/dashboard) rather than bouncing out to the public
                marketing page - the marketing header shows "login" CTAs
                that read as a sign-out even though the session is still
                live. */}
            <DashboardLogoLink />
            {/* md+ only: below that, every one of these controls (lang
                toggle, email/plan text, sign-out) moves into MobileNav's
                drawer instead - packed into this same row on a narrow
                viewport, the sign-out button could get squeezed off-
                screen entirely (see MobileNav's own comment). */}
            <div className="hidden min-w-0 items-center gap-3 md:flex">
              <LangToggle />
              <span className="max-w-[16rem] truncate text-sm text-muted-foreground">
                {profile?.email} · <T k="dashboard.plan" />: {planLabel ?? <T k="dashboard.notSubscribed" />}
              </span>
              <SignOutButton />
            </div>
            <MobileNav email={profile?.email} planLabel={planLabel ?? <T k="dashboard.notSubscribed" />} />
          </div>
        </header>

        {/* SidebarNav renders its own <aside> (width now varies with its
            collapsed/expanded state, so that couldn't stay a static
            wrapper owned here) - see sidebar-nav.tsx. */}
        <div className="container flex gap-8 py-8 print:p-0">
          <SidebarNav />
          <main className="min-w-0 flex-1 print:w-full">{children}</main>
        </div>
      </div>
    </UnsavedChangesProvider>
  );
}
