"use client";

import Link from "next/link";

import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LangToggle } from "@/components/lang-toggle";
import { T } from "@/components/t";
import { useI18n } from "@/lib/i18n/context";

/**
 * Mobile-only (`sm:hidden`) overflow menu for the marketing header
 * (app/page.tsx) - reported live (2026-09) at 375px: the logo + lang
 * toggle + login link + CTA button all sat in one un-wrapping flex row
 * and simply overran the viewport width. Same fix pattern as the
 * dashboard's own app/dashboard/mobile-nav.tsx (a Sheet triggered by a
 * Menu button), but scoped to just the two secondary controls (lang
 * toggle, login/email) - the primary CTA is the one thing a visitor
 * came here to find, so it stays in the header row at every width
 * instead of being tucked behind a tap, unlike the dashboard's own
 * sign-out button which has no equivalent conversion cost.
 */
export function MarketingMobileNav({ userEmail }: { userEmail?: string | null }) {
  const { t } = useI18n();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="sm:hidden" aria-label={t("nav.menu")}>
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="sm:hidden">
        <SheetTitle>{t("nav.menu")}</SheetTitle>
        <div className="flex flex-col gap-4 pt-2">
          <LangToggle />
          {userEmail ? (
            <p className="truncate text-sm text-muted-foreground">{userEmail}</p>
          ) : (
            <Link href="/login?mode=login" className="text-sm text-muted-foreground hover:text-foreground">
              <T k="nav.login" />
            </Link>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
