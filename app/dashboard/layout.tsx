import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { T } from "@/components/t";
import { LangToggle } from "@/components/lang-toggle";
import { SignOutButton } from "./sign-out-button";
import { SidebarNav } from "./sidebar-nav";
import { DashboardLogoLink } from "./logo-link";

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
    <div className="min-h-screen bg-muted/50 print:bg-background">
      <header className="border-b border-border bg-background print:hidden">
        <div className="container flex h-16 items-center justify-between gap-3">
          {/* Inside the logged-in app, the logo stays inside the app
              (/dashboard) rather than bouncing out to the public
              marketing page - the marketing header shows "login" CTAs
              that read as a sign-out even though the session is still
              live. */}
          <DashboardLogoLink />
          <div className="flex min-w-0 items-center gap-3">
            <LangToggle />
            <span className="hidden max-w-[16rem] truncate text-sm text-muted-foreground sm:inline">
              {profile?.email} · <T k="dashboard.plan" />: {planLabel ?? <T k="dashboard.notSubscribed" />}
            </span>
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium uppercase text-muted-foreground sm:hidden">
              {planLabel ?? <T k="dashboard.notSubscribed" />}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="container flex gap-8 py-8 print:p-0">
        <aside className="hidden w-52 shrink-0 md:block print:hidden">
          <div className="sticky top-8">
            <SidebarNav />
          </div>
        </aside>
        <main className="min-w-0 flex-1 print:w-full">{children}</main>
      </div>
    </div>
  );
}
