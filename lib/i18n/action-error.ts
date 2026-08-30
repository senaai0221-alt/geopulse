import type { Locale } from "./context";

/**
 * Server Actions (app/dashboard/actions.ts, lib/plan-limits.ts) run before
 * any locale is known, so they throw a plain, untranslated error *code*
 * (optionally "code:param") instead of user-facing text. This maps that
 * code back to a translated, ready-to-display string on the client, where
 * the active locale is known. Anything unrecognized (e.g. a raw Supabase
 * error message) falls back to a generic translated message rather than
 * leaking untranslated text.
 */
export function translateActionError(
  t: (key: string, vars?: Record<string, string | number>) => string,
  raw: string,
  fallbackKey: string
): string {
  const [code, param] = raw.split(":");

  switch (code) {
    case "brand_name_required":
      return t("settings.brandNameRequired");
    case "prompt_text_required":
      return t("dashboard.promptTextRequired");
    case "no_free_tier":
      return t("settings.noFreeTier");
    case "brand_limit":
      return t("settings.brandLimitReached", { max: param ?? "" });
    case "prompt_limit":
      return t("dashboard.promptLimitReached", { max: param ?? "" });
    default:
      return t(fallbackKey);
  }
}
