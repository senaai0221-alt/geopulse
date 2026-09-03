"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertCanAddBrand, assertCanAddPrompt } from "@/lib/plan-limits";
import { runPromptCheckNow } from "@/lib/prompt-check";

// Same caps as app/dashboard/actions.ts's own LIMITS, except
// competitorCount - the wizard only ever renders 3 competitor inputs
// (see onboarding-wizard.tsx), not the dashboard's general form.
const LIMITS = {
  brandName: 100,
  domain: 200,
  aliasItem: 100,
  aliasCount: 5,
  competitorItem: 60,
  competitorCount: 3,
  promptText: 300,
  category: 50,
} as const;

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

// Same shape as app/dashboard/actions.ts's own parseAliases - a
// bounded, comma-separated list of alternate names/nicknames for the
// tracked brand itself (see supabase/schema.sql's brands.aliases and
// lib/geo-engine.ts's parseResponse). The wizard didn't have this
// field at all before - a new subscriber whose brand name doesn't
// exactly match how an LLM spells it (see AliasSuggestionHint) had no
// way to fix that until their first visit to the dashboard's own brand
// form.
function parseAliases(raw: string): string[] {
  return raw
    .split(",")
    .map((a) => truncate(a.trim(), LIMITS.aliasItem))
    .filter(Boolean)
    .slice(0, LIMITS.aliasCount);
}

async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user: user! };
}

/**
 * The one-page setup wizard's single submit (see onboarding-wizard.tsx):
 * saves the brand, up to 3 competitors, and up to 3 prompts in one go,
 * kicks off an immediate first-time measurement for whichever prompts
 * were actually created (same reasoning as PromptForm - a fresh account
 * seeing real data on their first dashboard visit instead of a full day
 * of empty "計測中" rows), and marks the account as onboarded so
 * middleware.ts stops routing it here.
 *
 * Not wrapped in a database transaction - matches every other multi-row
 * write in this app (see e.g. createBrand/createPrompt in
 * app/dashboard/actions.ts), which all trust individual statement
 * atomicity rather than cross-statement rollback. A prompt-insert
 * failure after the brand already saved is treated as non-fatal (the
 * brand + onboarding_completed still land; prompts can always be added
 * afterward from the dashboard's own PromptForm) rather than leaving the
 * account in a half-finished state the wizard would otherwise re-show
 * forever.
 */
export async function completeOnboarding(formData: FormData): Promise<{ ok: boolean; code?: string }> {
  const { supabase, user } = await requireUser();

  const brandName = truncate(String(formData.get("brand_name") ?? "").trim(), LIMITS.brandName);
  // Same code BrandForm's own createBrand throws for the same condition
  // (see lib/i18n/action-error.ts) - the wizard's client side already
  // checks this before ever calling the action (native browser
  // validation bubbles show in the wrong language), so this is only a
  // defensive backstop, not the primary path.
  if (!brandName) return { ok: false, code: "brand_name_required" };

  const domain = truncate(String(formData.get("domain") ?? "").trim(), LIMITS.domain);
  const aliases = parseAliases(String(formData.get("aliases") ?? ""));

  const competitors = Array.from({ length: LIMITS.competitorCount }, (_, i) =>
    truncate(String(formData.get(`competitor_${i + 1}`) ?? "").trim(), LIMITS.competitorItem)
  ).filter(Boolean);

  const prompts = Array.from({ length: 3 }, (_, i) => ({
    text: truncate(String(formData.get(`prompt_text_${i + 1}`) ?? "").trim(), LIMITS.promptText),
    category: truncate(String(formData.get(`prompt_category_${i + 1}`) ?? "").trim(), LIMITS.category),
  })).filter((p) => p.text);

  const { data: profile } = await supabase.from("profiles").select("plan").eq("id", user.id).single();

  try {
    assertCanAddBrand(profile?.plan, 0);
    if (prompts.length > 0) assertCanAddPrompt(profile?.plan, 0);
  } catch (err) {
    return { ok: false, code: err instanceof Error ? err.message : "unknown" };
  }

  const { data: brand, error: brandError } = await supabase
    .from("brands")
    .insert({ user_id: user.id, name: brandName, domain: domain || null, aliases, competitors })
    .select("id")
    .single();

  if (brandError || !brand) return { ok: false, code: "brand_save_failed" };

  let createdPrompts: { id: string; text: string }[] = [];
  if (prompts.length > 0) {
    const { data: insertedPrompts } = await supabase
      .from("prompts")
      .insert(prompts.map((p) => ({ brand_id: brand.id, text: p.text, category: p.category || null })))
      .select("id, text");
    createdPrompts = (insertedPrompts ?? []).map((p) => ({ id: p.id as string, text: p.text as string }));
  }

  await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id);

  // Runs every created prompt's first-time measurement directly (see
  // maxDuration on app/onboarding/page.tsx), rather than fetching back
  // to this app's own /api/prompts/check-now over HTTP the way this
  // used to work. That fetch ran from inside a Server Action - no
  // browser attached, so it carried none of the caller's session
  // cookies - and check-now's own auth check saw `user: null` on every
  // single call, always returning 401. The failure was swallowed by a
  // `.catch(() => {})` meant to guard against "the LLM providers are
  // slow", not "this call can structurally never succeed" - so every
  // brand-new subscriber's dashboard sat on "初回計測中" forever with
  // no error anywhere, until the next morning's cron quietly covered it
  // instead (2026-09 incident, found doing a full new-user walkthrough).
  // Calling runPromptCheckNow directly needs no cookie at all - ownership
  // here is "I just created this brand/prompt myself, under this
  // request's own authenticated user", not a second round-trip through
  // an HTTP auth check. Awaited (not fire-and-forget) for the same
  // reason as before: the whole point is the dashboard this redirects to
  // next shows real numbers immediately instead of empty "計測中" rows,
  // and an un-awaited call has no guarantee of finishing once this
  // Server Action returns and the invocation ends. Still best-effort -
  // a failed check here just means tomorrow's cron covers it normally.
  if (createdPrompts.length > 0) {
    const admin = createAdminClient();
    await Promise.all(
      createdPrompts.map((prompt) =>
        runPromptCheckNow(admin, {
          promptId: prompt.id,
          promptText: prompt.text,
          brandId: brand.id,
          brandName,
          brandAliases: aliases,
          competitors,
        }).catch((err) => {
          console.error(`onboarding: first-time check failed for prompt ${prompt.id}:`, err);
        })
      )
    );
  }

  return { ok: true };
}
