"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { assertCanAddBrand, assertCanAddPrompt } from "@/lib/plan-limits";

// Same caps as app/dashboard/actions.ts's own LIMITS, except
// competitorCount - the wizard only ever renders 3 competitor inputs
// (see onboarding-wizard.tsx), not the dashboard's general form.
const LIMITS = {
  brandName: 100,
  domain: 200,
  competitorItem: 60,
  competitorCount: 3,
  promptText: 300,
  category: 50,
} as const;

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
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
    .insert({ user_id: user.id, name: brandName, domain: domain || null, competitors })
    .select("id")
    .single();

  if (brandError || !brand) return { ok: false, code: "brand_save_failed" };

  let createdPromptIds: string[] = [];
  if (prompts.length > 0) {
    const { data: insertedPrompts } = await supabase
      .from("prompts")
      .insert(prompts.map((p) => ({ brand_id: brand.id, text: p.text, category: p.category || null })))
      .select("id");
    createdPromptIds = (insertedPrompts ?? []).map((p) => p.id as string);
  }

  await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id);

  // Unlike PromptForm's own truly fire-and-forget first-time check (a
  // client-side fetch the browser keeps alive on its own regardless of
  // whether the page awaits it), this one runs from a Server Action - an
  // un-awaited fetch here has no such guarantee once this function
  // returns and the serverless invocation ends, so it's awaited on
  // purpose. The whole point of running it at all is that the dashboard
  // the wizard redirects to next shows real numbers immediately instead
  // of a full day of empty "計測中" rows; a fire-and-forget call that
  // gets cut off mid-flight would defeat that. Runs every created
  // prompt's check in parallel (see maxDuration on app/onboarding/
  // page.tsx), so the wait is bounded by the single slowest prompt, not
  // the sum of all of them. Best-effort either way - a failed check here
  // just means tomorrow's cron covers it normally instead, same
  // fallback check-now's own route already documents.
  await Promise.all(
    createdPromptIds.map((promptId) =>
      fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/prompts/check-now`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptId }),
      }).catch(() => {})
    )
  );

  return { ok: true };
}
