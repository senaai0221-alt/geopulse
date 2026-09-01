/**
 * Shared types/constants for "GEO施策メモ" (marketing_actions - see
 * supabase/schema.sql) plus the one read query both consumers need:
 * app/dashboard/page.tsx (event markers on the trend charts) and
 * app/dashboard/report/page.tsx (before/after context for the AI
 * commentary, see lib/report-insights.ts). Mutations (create/update/
 * delete) live in app/dashboard/actions.ts as Server Actions, alongside
 * every other CRUD write in this app - this file is just the shape and
 * the shared read.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const MARKETING_ACTION_CATEGORIES = [
  "press_release",
  "blog_note",
  "sns",
  "website_seo",
  "faq_jsonld",
  "other",
] as const;

export type MarketingActionCategory = (typeof MARKETING_ACTION_CATEGORIES)[number];

export interface MarketingAction {
  id: string;
  brand_id: string;
  action_date: string; // 'YYYY-MM-DD'
  category: MarketingActionCategory;
  title: string;
  notes: string | null;
  created_at: string;
}

/**
 * Japanese label for each category - used only server-side, by
 * lib/report-insights.ts's AI prompt (deliberately JA-only, same as
 * the rest of that file - see its own comments). The UI's category
 * picker/badges go through the normal i18n dictionary instead
 * (`marketingActions.category.<key>`), so they follow the JA/EN toggle
 * like everything else on the page.
 */
export const MARKETING_ACTION_CATEGORY_LABELS_JA: Record<MarketingActionCategory, string> = {
  press_release: "プレスリリース",
  blog_note: "ブログ/note執筆",
  sns: "SNS投稿",
  website_seo: "サイトSEO改修",
  faq_jsonld: "構造化データ(FAQ等)",
  other: "その他",
};

export function isMarketingActionCategory(value: string): value is MarketingActionCategory {
  return (MARKETING_ACTION_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Every logged action for one brand within [start, end) - used both for
 * the trend chart markers (dashboard/page.tsx passes its own 90-day
 * window) and the report page (passes one calendar month). RLS
 * (marketing_actions_crud_own) already scopes this to brands the caller
 * owns, same as every other brand-scoped read in this app.
 */
export async function getMarketingActions(
  supabase: SupabaseClient,
  brandId: string,
  range: { start: Date; end: Date }
): Promise<MarketingAction[]> {
  const { data, error } = await supabase
    .from("marketing_actions")
    .select("*")
    .eq("brand_id", brandId)
    .gte("action_date", range.start.toISOString().slice(0, 10))
    .lt("action_date", range.end.toISOString().slice(0, 10))
    .order("action_date", { ascending: true });

  if (error) {
    console.error("getMarketingActions failed:", error);
    return [];
  }
  return (data ?? []) as MarketingAction[];
}
