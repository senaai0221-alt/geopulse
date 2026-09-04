"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n/context";
import { LangToggle } from "@/components/lang-toggle";
import { NAV_ITEMS, MOBILE_BILLING_ITEM } from "./nav-items";
import { SignOutButton } from "./sign-out-button";

/**
 * Mobile-only (`md:hidden`) hamburger + slide-in drawer - previously
 * there was no way at all to reach /dashboard/report, /help, or
 * /settings from a phone (SidebarNav is `hidden md:block`, and the
 * header itself had no nav of its own), and the header's own controls
 * (lang toggle, email/plan text, sign-out) were all crammed into the
 * same row as the logo with nothing hidden, so the sign-out button
 * could get squeezed off-screen on a narrow viewport. This is the
 * single mobile entry point for everything that content lived in
 * across both places - see app/dashboard/layout.tsx, which now hides
 * that whole header control row below `md` and renders just this
 * button instead.
 */
export function MobileNav({ email, planLabel }: { email?: string | null; planLabel: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  // Same "keep whichever brand is on screen" carry-through as
  // SidebarNav - see that component for why.
  const brand = searchParams.get("brand");
  const items = [...NAV_ITEMS, MOBILE_BILLING_ITEM];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="md:hidden" aria-label={t("nav.menu")}>
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="md:hidden">
        <SheetTitle>{t("nav.menu")}</SheetTitle>

        {email && <p className="truncate text-sm text-muted-foreground">{email}</p>}

        <nav className="flex flex-col gap-1">
          {items.map((item) => {
            // A hashed item (MOBILE_BILLING_ITEM, "#billing") is a
            // shortcut to a section of the settings page, not a
            // separate "current location" - it must never highlight as
            // active itself. Before this check, splitting the hash off
            // for the startsWith comparison (needed so /dashboard/
            // settings#billing still matches while navigating there)
            // also silently made it match "設定・連携"'s own href
            // (both reduce to the same "/dashboard/settings" prefix),
            // so opening Settings lit up BOTH entries at once - a real
            // mobile screenshot reported exactly this (2026-09).
            const isActive = item.href.includes("#")
              ? false
              : item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href.split("#")[0]);
            const href = brand && !item.href.includes("#") ? `${item.href}?brand=${encodeURIComponent(brand)}` : item.href;
            return (
              <Link
                key={item.href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <LangToggle />
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium uppercase text-muted-foreground">
              {planLabel}
            </span>
          </div>
          <SignOutButton />
        </div>
      </SheetContent>
    </Sheet>
  );
}
