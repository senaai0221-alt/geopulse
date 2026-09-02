"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NAV_ITEMS } from "./nav-items";

const STORAGE_KEY = "zonostick-sidebar-collapsed";

/**
 * Desktop (`md:` and up) sidebar - owns its own `<aside>` wrapper (not
 * just the nav list) so its width can respond to the collapsed state,
 * plus the collapse/expand toggle itself. Mobile has no sidebar at all
 * (see mobile-nav.tsx's drawer instead) - this component renders
 * nothing below `md`.
 *
 * Collapsed state persists in localStorage (not a cookie/DB column -
 * this is a pure display preference, not account data worth a round
 * trip) so it survives navigation and repeat visits. Starts expanded
 * on every fresh server render (localStorage isn't readable during
 * SSR) and syncs from storage in an effect after mount - a returning
 * user who'd previously collapsed it sees one brief expanded frame
 * before it collapses, rather than a hydration mismatch from guessing
 * at the stored value server-side.
 */
export function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true);
    } catch {
      // Private-browsing/storage-blocked - just stays expanded.
    }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Nothing to persist to - the in-memory toggle still works for
        // the rest of this visit.
      }
      return next;
    });
  }

  // Carries the currently-selected brand across every sidebar link, not
  // just the one the user happened to click from - without this,
  // following any nav link (Report, back to Dashboard, ...) silently
  // dropped back to the first/oldest brand instead of staying on
  // whichever one was actually on screen. Harmless to append on pages
  // that don't read a `brand` param (Help) - an unused query param.
  const brand = searchParams.get("brand");

  return (
    <aside
      className={cn(
        "hidden shrink-0 md:block print:hidden transition-[width] duration-200",
        collapsed ? "w-16" : "w-52"
      )}
    >
      <div className="sticky top-8 flex flex-col gap-2">
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const href = brand ? `${item.href}?brand=${encodeURIComponent(brand)}` : item.href;
            const link = (
              <Link
                href={href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  collapsed && "justify-center",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && t(item.labelKey)}
              </Link>
            );
            // Only bother with a hover tooltip once the label itself is
            // hidden - expanded already shows the screen name as plain
            // text right next to the icon.
            if (!collapsed) {
              return <div key={item.href}>{link}</div>;
            }
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{t(item.labelKey)}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={toggle}
          aria-label={t(collapsed ? "nav.expandSidebar" : "nav.collapseSidebar")}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            collapsed && "justify-center"
          )}
        >
          {collapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronLeft className="h-4 w-4 shrink-0" />}
          {!collapsed && t("nav.collapseSidebar")}
        </button>
      </div>
    </aside>
  );
}
