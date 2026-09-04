import {
  LayoutDashboard,
  FileText,
  BookOpen,
  HelpCircle,
  Settings,
  Plug,
  CreditCard,
  MessageSquareWarning,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  /** Every current nav item is a real, leaf route with no sub-pages of
   *  its own, so this is `true` everywhere except Report - kept
   *  per-item (not dropped) so a future nested route can opt back into
   *  prefix matching deliberately, rather than every item silently
   *  becoming exact-only by omission. */
  exact: boolean;
}

export interface NavSection {
  /** Undefined for the top, ungrouped section (Dashboard/Report) - only
   *  the grouped sections below it get a visible header. */
  titleKey?: string;
  items: NavItem[];
}

/**
 * Shared between the desktop sidebar (sidebar-nav.tsx) and the mobile
 * drawer (mobile-nav.tsx) so the two never drift out of sync - both the
 * item list itself and (see isNavItemActive below) how "current page"
 * is decided from it.
 *
 * Restructured 2026-09: 設定/連携/プラン/問い合わせ and ガイド/よくある質問
 * used to be sections *within* one combined page each (settings, help),
 * reached by scrolling or a same-page hash anchor
 * (`/dashboard/settings#billing`). That hash anchor was the direct
 * cause of a real double-highlight bug (see mobile-nav.tsx's git
 * history) - a hashed item and its parent page both reduce to the same
 * pathname, so any prefix-based active check lights up both entries at
 * once unless the hash case is special-cased. Splitting every one of
 * these into its own real, top-level route removes the whole bug class
 * at the source instead of adding another special case: every item
 * here is now a plain, hash-free pathname, so `isNavItemActive` doesn't
 * need to know about hashes at all any more.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/dashboard", labelKey: "dashboard.dashboard", icon: LayoutDashboard, exact: true },
      { href: "/dashboard/report", labelKey: "dashboard.reportNav", icon: FileText, exact: false },
    ],
  },
  {
    titleKey: "dashboard.guideSectionNav",
    items: [
      { href: "/dashboard/help", labelKey: "dashboard.helpNav", icon: BookOpen, exact: true },
      { href: "/dashboard/faq", labelKey: "dashboard.faqNav", icon: HelpCircle, exact: true },
    ],
  },
  {
    titleKey: "dashboard.accountSectionNav",
    items: [
      { href: "/dashboard/settings", labelKey: "dashboard.settings", icon: Settings, exact: true },
      { href: "/dashboard/integrations", labelKey: "dashboard.integrationsNav", icon: Plug, exact: true },
      { href: "/dashboard/plan", labelKey: "dashboard.billingNav", icon: CreditCard, exact: true },
      { href: "/dashboard/contact", labelKey: "dashboard.contactNav", icon: MessageSquareWarning, exact: true },
    ],
  },
];

/** Flat view of NAV_SECTIONS, for call sites that don't care about
 *  section grouping (there are none left in this app right now, but a
 *  flat list is cheaper to keep exported than to reconstruct later). */
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

/**
 * Single source of truth for "is this nav item the current page" -
 * used by both SidebarNav and MobileNav so the two can never compute
 * two different answers for the same pathname (see this file's own
 * comment above for the incident that made that a real risk). Every
 * item is now a plain pathname (no `#hash`, see above), so this is
 * deliberately just the exact/prefix check with nothing else to it.
 */
export function isNavItemActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}
