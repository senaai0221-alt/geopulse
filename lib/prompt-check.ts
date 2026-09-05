import type { createAdminClient } from "@/lib/supabase/admin";
import { runGeoQuery } from "./geo-engine";

export interface PromptCheckInput {
  promptId: string;
  promptText: string;
  brandId: string;
  brandName: string;
  brandAliases: string[];
  competitors: string[];
}

/**
 * Core "run one immediate measurement for one prompt, write the
 * rankings rows" logic - queries all 6 providers and inserts the
 * result, exactly like the daily cron does for one prompt, but
 * synchronously and on demand.
 *
 * Extracted out of app/api/prompts/check-now/route.ts (which still owns
 * auth/rate-limiting/ownership - all HTTP-request concerns) so
 * app/onboarding/actions.ts's Server Action can call it directly instead
 * of doing an HTTP fetch back to that same route from the server. That
 * fetch used to be how the onboarding wizard triggered a new account's
 * very first measurement - and it silently 401'd on every single
 * onboarding completion (2026-09 incident): a Server Action runs with
 * no browser attached, so a plain `fetch()` back to this app's own API
 * carries none of the caller's session cookies, and check-now's own
 * `supabase.auth.getUser()` always saw `user: null`. The failure was
 * swallowed by a `.catch(() => {})` meant for "the LLM providers are
 * slow, don't block onboarding on them" - not for "this call can never
 * succeed at all" - so a brand-new subscriber's dashboard sat on
 * "初回計測中" forever with no error anywhere, until the next morning's
 * cron quietly covered it instead. Calling this function directly
 * removes the HTTP round-trip (and the cookie it can never carry)
 * entirely, rather than trying to patch the fetch to forward one.
 *
 * Ownership is entirely the CALLER's responsibility - this only ever
 * writes, using whatever brand/prompt fields it's handed. The route
 * verifies via an RLS-scoped read before calling this; the onboarding
 * action already owns the brand/prompt outright, having just inserted
 * them itself under the authenticated user in the same request.
 */
export async function runPromptCheckNow(
  admin: ReturnType<typeof createAdminClient>,
  input: PromptCheckInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { promptId, promptText, brandId, brandName, brandAliases, competitors } = input;

  // Fetched before running the query so a failed provider call can fall
  // back to "what did we already know" instead of overwriting it with a
  // blank result - see the insert below.
  const { data: previousRows } = await admin
    .from("rankings")
    .select("provider, mentioned, rank_position, checked_at")
    .eq("prompt_id", promptId)
    .order("checked_at", { ascending: false })
    .limit(12);
  const previousByProvider = new Map<string, { mentioned: boolean; rank_position: number | null }>();
  for (const row of previousRows ?? []) {
    if (!previousByProvider.has(row.provider)) {
      previousByProvider.set(row.provider, { mentioned: row.mentioned, rank_position: row.rank_position });
    }
  }

  const results = await runGeoQuery({
    prompt: promptText,
    brandName,
    brandAliases,
    competitors,
  });

  const checkedAt = new Date().toISOString();
  // A provider call that timed out or errored must never be written as
  // a real "not mentioned" (a false "圏外") - it would silently read as
  // a genuine drop everywhere this data is used. On error, carry
  // forward the last known-good mentioned/rank_position for that
  // provider instead, and keep `error` set so it's still visible (see
  // the dashboard's per-cell warning icon).
  const { error: insertError } = await admin.from("rankings").insert(
    results.map((result) => {
      if (result.error) {
        const previous = previousByProvider.get(result.provider);
        return {
          brand_id: brandId,
          prompt_id: promptId,
          provider: result.provider,
          mentioned: previous?.mentioned ?? false,
          rank_position: previous?.rank_position ?? null,
          sentiment: null,
          competitors_mentioned: [],
          citations: [],
          raw_response: null,
          error: result.error,
          cost_usd: result.costUsd,
          // Every row this function writes is an on-demand check, never
          // the daily cron - see rankings.source's own comment and
          // lib/cost-budget.ts's getMonthlyManualCheckCount, which
          // counts exactly this tag to cap an account's monthly total.
          source: "manual",
          checked_at: checkedAt,
        };
      }
      return {
        brand_id: brandId,
        prompt_id: promptId,
        provider: result.provider,
        mentioned: result.mentioned,
        rank_position: result.rankPosition,
        sentiment: result.sentiment,
        competitors_mentioned: result.competitorsMentioned,
        citations: result.citations,
        raw_response: result.rawResponse || null,
        error: null,
        cost_usd: result.costUsd,
        source: "manual",
        checked_at: checkedAt,
      };
    })
  );

  if (insertError) {
    return { ok: false, error: insertError.message };
  }
  return { ok: true };
}
