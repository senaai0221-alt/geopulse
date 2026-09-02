import { LayoutDashboard, Settings, FileText, HelpCircle, CreditCard, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  exact: boolean;
}

/** Shared between the desktop sidebar (sidebar-nav.tsx) and the mobile
 *  drawer (mobile-nav.tsx) so the two never drift out of sync. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard.dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/report", labelKey: "dashboard.reportNav", icon: FileText, exact: false },
  { href: "/dashboard/help", labelKey: "dashboard.helpNav", icon: HelpCircle, exact: false },
  { href: "/dashboard/settings", labelKey: "dashboard.settings", icon: Settings, exact: false },
];

/**
 * Mobile-drawer-only: a direct link to the plan/billing card
 * (settings/page.tsx's id="billing") rather than a generic repeat of
 * "設定・連携" above. Not added to NAV_ITEMS/the desktop sidebar - on
 * desktop the plan card already sits one scroll away inside Settings,
 * so a second sidebar entry for the same page would be a near-
 * duplicate; on mobile there's no sidebar to scroll at all, so calling
 * out billing specifically (as requested) is worth the one extra row.
 */
export const MOBILE_BILLING_ITEM: NavItem = {
  href: "/dashboard/settings#billing",
  labelKey: "dashboard.billingNav",
  icon: CreditCard,
  exact: false,
};
