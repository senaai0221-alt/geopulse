"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

/**
 * The dashboard header's logo, disabled (renders as plain text, no
 * navigation) while already on /dashboard/settings - that page holds
 * several unsaved forms (add/edit target, Slack webhook), and a stray
 * logo click there would otherwise navigate away and lose whatever was
 * being typed. Everywhere else in the app it's a normal link home.
 */
export function DashboardLogoLink() {
  const pathname = usePathname();
  const disabled = pathname === "/dashboard/settings";

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
