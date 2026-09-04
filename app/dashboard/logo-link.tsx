"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

// Every page whose forms hold typed-but-unsaved input a stray logo
// click would silently discard - originally just /dashboard/settings
// (add/edit target, plus Slack webhook before that moved out), now one
// entry per page since the 2026-09 nav split gave each of those forms
// its own route (see nav-items.ts's own comment on that split).
const FORM_PAGES = ["/dashboard/settings", "/dashboard/integrations", "/dashboard/contact"];

/**
 * The dashboard header's logo, disabled (renders as plain text, no
 * navigation) while on one of FORM_PAGES above - a stray logo click
 * there would otherwise navigate away and lose whatever was being
 * typed. Everywhere else in the app it's a normal link home.
 */
export function DashboardLogoLink() {
  const pathname = usePathname();
  const disabled = FORM_PAGES.includes(pathname);

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className="flex shrink-0 cursor-default select-none items-center gap-2 font-bold text-lg"
      >
        <Sparkles className="h-5 w-5 text-primary" />
        Zonostick
      </span>
    );
  }

  return (
    <Link href="/dashboard" className="flex shrink-0 items-center gap-2 font-bold text-lg">
      <Sparkles className="h-5 w-5 text-primary" />
      Zonostick
    </Link>
  );
}
