import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { runGeoQuery, type LlmProvider } from "@/lib/geo-engine";
import { sendDailySummary, type RankingChange } from "@/lib/slack";
import { sendAlertEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
// With Fluid compute (on by default for new projects, ours included),
// even the free Hobby plan allows up to 300s - Pro/Enterprise raise
// that further (800s, 1800s in beta). 280 leaves a small safety margin
// under Hobby's 300s ceiling. The time-budget guard in runDailyCheck()
// targets a safety margin under *this* value so we always return a
// clean response instead of being hard-killed mid-request.
export const maxDuration = 280;

/**
 * Verifies the request came from Vercel Cron or Upstash QStash rather
 * than an arbitrary caller. Vercel Cron sends `Authorization: Bearer
 * <CRON_SECRET>` when a Cron Secret is configured; QStash requests can
 * additionally be verified via the `Upstash-Signature` header if you
 * wire up @upstash/qstash's Receiver in front of this check.
 */
function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // no secret configured - allow (dev only)

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

interface BrandRow {
  id: string;
  user_id: string;
  name: string;
  competitors: string[];
  rank_drop_threshold: number;
}

interface PromptRow {
  id: string;
  brand_id: string;
  text: string;
}

interface RankingRow {
  provider: LlmProvider;
  mentioned: boolean;
  rank_position: number | null;
  checked_at: string;
}

/**
 * Runs `worker` over `items` with at most `limit` running concurrently,
 * rather than either fully sequential (slow, risks the Vercel execution
 * timeout as brand/prompt counts grow) or fully parallel (can trip LLM
 * provider rate limits / exhaust the DB connection pool). Each item is
 * independent: one throwing does not stop the others from starting or
 * completing.
 */
async function processWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    const current = nextIndex++;
    if (current >= items.length) return;
    await worker(items[current]);
    return runNext();
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => runNext()));
}

/**
 * Runs every active prompt for one brand against all LLM providers and
 * writes the results, diffing against the previous measurement per
 * provider to detect anomalies (brand dropped out / rank worsened).
 *
 * Each prompt is isolated in its own try/catch: a DB hiccup or unexpected
 * error on one prompt must not stop the brand's other prompts from being
 * checked, and provider-level failures are already isolated further
 * downstream by runGeoQuery()'s Promise.allSettled.
 */
async function processBrand(
  supabase: ReturnType<typeof createAdminClient>,
  brand: BrandRow,
  prompts: PromptRow[],
  checkedAt: Date
) {
  const anomalies: RankingChange[] = [];
  let totalChecks = 0;
  let mentionedCount = 0;

  await Promise.all(
    prompts.map(async (prompt) => {
      try {
        // Grab the previous measurement per provider before writing new
        // rows, so we can diff against it for anomaly detection.
        const { data: previousRows } = await supabase
          .from("rankings")
          .select("provider, mentioned, rank_position, checked_at")
          .eq("prompt_id", prompt.id)
          .order("checked_at", { ascending: false })
          .limit(4);

        const previousByProvider = new Map<LlmProvider, RankingRow>();
        for (const row of (previousRows ?? []) as RankingRow[]) {
          if (!previousByProvider.has(row.provider)) {
            previousByProvider.set(row.provider, row);
          }
        }

        const results = await runGeoQuery({
          prompt: prompt.text,
          brandName: brand.name,
          competitors: brand.competitors ?? [],
        });

        // A provider call that timed out or errored must never be
        // written as a real "not mentioned" (a false "圏外") - that
        // would silently read as a genuine drop everywhere the data is
        // used (today's badge, the trend chart, monthly report KPIs)
        // instead of the failed measurement it actually was. On error,
        // carry forward the last known-good mentioned/rank_position for
        // that provider instead of overwriting it with a blank result,
        // while still recording `error` so it's visible (see the
        // dashboard's per-cell warning icon) and never counted as a
        // real anomaly (see the `if (result.error) continue` below).
        const rowsToInsert = results.map((result) => {
          if (result.error) {
            const previous = previousByProvider.get(result.provider);
            return {
              brand_id: brand.id,
              prompt_id: prompt.id,
              provider: result.provider,
              mentioned: previous?.mentioned ?? false,
              rank_position: previous?.rank_position ?? null,
              sentiment: null,
              competitors_mentioned: [],
              citations: [],
              raw_response: null,
              error: result.error,
              checked_at: checkedAt.toISOString(),
            };
          }
          return {
            brand_id: brand.id,
            prompt_id: prompt.id,
            provider: result.provider,
            mentioned: result.mentioned,
            rank_position: result.rankPosition,
            sentiment: result.sentiment,
            competitors_mentioned: result.competitorsMentioned,
            citations: result.citations,
            raw_response: result.rawResponse || null,
            error: null,
            checked_at: checkedAt.toISOString(),
          };
        });

        const { error: insertError } = await supabase.from("rankings").insert(rowsToInsert);
        if (insertError) {
          console.error(`Failed to insert rankings for prompt ${prompt.id}:`, insertError.message);
          return;
        }

        for (const result of results) {
          if (result.error) continue;
          totalChecks += 1;
          if (result.mentioned) mentionedCount += 1;

          const previous = previousByProvider.get(result.provider);
          const wasMentioned = previous?.mentioned ?? false;
          const previousRank = previous?.rank_position ?? null;

          let isAnomaly = false;
          let severity: "info" | "warning" | "critical" = "info";
          let message = "";

          if (wasMentioned && !result.mentioned) {
            isAnomaly = true;
            severity = "critical";
            message = `${brand.name} が「${prompt.text}」への${result.provider}の回答から圏外になりました。`;
          } else if (
            previousRank !== null &&
            result.rankPosition !== null &&
            result.rankPosition - previousRank >= brand.rank_drop_threshold
          ) {
            isAnomaly = true;
            severity = "warning";
            message = `${brand.name} の順位が「${prompt.text}」(${result.provider})で ${previousRank}位 → ${result.rankPosition}位 に悪化しました。`;
          }

          if (isAnomaly) {
            anomalies.push({
              brandName: brand.name,
              promptText: prompt.text,
              provider: result.provider,
              previousRank,
              currentRank: result.rankPosition,
              mentioned: result.mentioned,
            });

            await supabase.from("alerts").insert({
              user_id: brand.user_id,
              brand_id: brand.id,
              prompt_id: prompt.id,
              provider: result.provider,
              severity,
              message,
              previous_rank: previousRank,
              current_rank: result.rankPosition,
            });
          }
        }
      } catch (err) {
        // One prompt failing (network blip on a DB call, etc.) must not
        // take down the brand's other prompts - Promise.all rejects as
        // soon as any one entry throws, which would otherwise abandon
        // whatever the sibling prompts were still doing.
        console.error(`daily-check: prompt ${prompt.id} (brand ${brand.id}) failed:`, err);
      }
    })
  );

  return { anomalies, totalChecks, mentionedCount };
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const runStartedAt = new Date();

  // Inserted before any real work starts, so a run that never reaches
  // either completion path below (the process was hard-killed by the
  // platform's execution time limit, for example) still leaves this row
  // behind with finished_at/ok left null - that absence-of-completion is
  // itself the diagnostic signal, see supabase/schema.sql.
  const { data: runRow } = await supabase
    .from("cron_runs")
    .insert({ job_name: "daily-check", started_at: runStartedAt.toISOString() })
    .select("id")
    .single();

  async function finishRun(fields: { ok: boolean; error?: string; summary?: unknown }) {
    if (!runRow) return; // insert itself failed - don't let that block the actual job
    const finishedAt = new Date();
    await supabase
      .from("cron_runs")
      .update({
        finished_at: finishedAt.toISOString(),
        duration_ms: finishedAt.getTime() - runStartedAt.getTime(),
        ok: fields.ok,
        error: fields.error ?? null,
        summary: fields.summary ?? null,
      })
      .eq("id", runRow.id);
  }

  try {
    const body = await runDailyCheck(supabase);
    await finishRun({ ok: true, summary: body });
    return NextResponse.json(body);
  } catch (err) {
    console.error("daily-check crashed:", err);
    const message = err instanceof Error ? err.message : String(err);
    await finishRun({ ok: false, error: message });
    return NextResponse.json(
      { error: message, stack: err instanceof Error ? err.stack : undefined },
      { status: 500 }
    );
  }
}

// How many brands to check concurrently. Keeps well within the time
// budget as the number of brands grows, without hammering the LLM
// providers' rate limits or the Supabase connection pool.
const BRAND_CONCURRENCY = 4;

// See maxDuration above (280s); stop *starting* new brands once we're
// this far in, so whatever is already in flight has room to finish
// cleanly and we always return a normal response instead of being
// hard-killed mid-request. Anything not started this run is picked up
// on tomorrow's cron automatically.
const TIME_BUDGET_MS = 220_000;

async function runDailyCheck(supabase: ReturnType<typeof createAdminClient>) {
  const checkedAt = new Date();
  const startedAt = Date.now();

  // Only check brands owned by a paying (pro/business) user - there is no
  // free tier, so an unpaid profile should never trigger LLM API calls
  // (see lib/plan-limits.ts for why).
  const { data: brands, error: brandsError } = await supabase
    .from("brands")
    .select("id, user_id, name, competitors, rank_drop_threshold, profiles!inner(plan)")
    .eq("is_active", true)
    .in("profiles.plan", ["pro", "business"]);

  if (brandsError) {
    throw new Error(brandsError.message);
  }

  const summary: Record<string, unknown>[] = [];
  const skipped: Record<string, unknown>[] = [];

  async function handleBrand(brand: BrandRow) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      skipped.push({ brandId: brand.id, brandName: brand.name, reason: "time_budget_exceeded" });
      return;
    }

    // A brand throwing an unexpected error must not take down the other
    // (unrelated) users' brands still queued in this same run.
    try {
      const { data: prompts } = await supabase
        .from("prompts")
        .select("id, brand_id, text")
        .eq("brand_id", brand.id)
        .eq("is_active", true);

      if (!prompts || prompts.length === 0) return;

      const { anomalies, totalChecks, mentionedCount } = await processBrand(
        supabase,
        brand,
        prompts as PromptRow[],
        checkedAt
      );

      // Notify this brand's owner, if configured. Email is the default
      // channel (email_alerts_enabled defaults true - see
      // supabase/schema.sql); Slack is the optional, additional one
      // (settings/page.tsx's "advanced" section). Each fires
      // independently in its own try/catch - one failing (a missing
      // RESEND_API_KEY, a bad webhook URL) must never block the other.
      // The outcome of each ("sent" / "skipped" / "error") is recorded
      // into this brand's summary entry below (see cron_runs in
      // supabase/schema.sql) - rankings being written successfully does
      // NOT imply the notification after it also went out, and without
      // this a silently-failed send is invisible until a user notices
      // their report never arrived.
      let slackStatus: "sent" | "skipped" | "error" = "skipped";
      let emailStatus: "sent" | "skipped" | "error" = "skipped";

      const { data: profile } = await supabase
        .from("profiles")
        .select("email, notification_email, email_alerts_enabled, slack_webhook_url, slack_enabled")
        .eq("id", brand.user_id)
        .single();

      if (profile?.slack_enabled && profile.slack_webhook_url) {
        try {
          await sendDailySummary(profile.slack_webhook_url, {
            brandName: brand.name,
            checkedAt,
            totalPrompts: prompts.length,
            totalChecks,
            mentionRate: totalChecks > 0 ? mentionedCount / totalChecks : 0,
            anomalies,
          });
          slackStatus = "sent";
        } catch (err) {
          slackStatus = "error";
          console.error(`Failed to send Slack summary for brand ${brand.id}:`, err);
        }
      }

      // Email only fires when there's actually something to flag (a
      // rank drop or disappearance) - unlike the Slack digest, which
      // sends a routine "all clear" summary every day, an inbox alert
      // is reserved for the cases the request specifically calls out.
      // notification_email overrides the account's own sign-in address
      // when the user has pointed alerts somewhere else (settings page).
      const alertTo = profile?.notification_email || profile?.email;
      if (anomalies.length > 0 && profile?.email_alerts_enabled !== false && alertTo) {
        try {
          await sendAlertEmail(alertTo, { brandName: brand.name, anomalies });
          emailStatus = "sent";
        } catch (err) {
          emailStatus = "error";
          console.error(`Failed to send alert email for brand ${brand.id}:`, err);
        }
      }

      summary.push({
        brandId: brand.id,
        brandName: brand.name,
        totalChecks,
        anomalies: anomalies.length,
        slack: slackStatus,
        email: emailStatus,
      });
    } catch (err) {
      console.error(`daily-check: brand ${brand.id} (${brand.name}) failed:`, err);
      summary.push({
        brandId: brand.id,
        brandName: brand.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await processWithConcurrency((brands ?? []) as BrandRow[], BRAND_CONCURRENCY, handleBrand);

  if (skipped.length > 0) {
    console.warn(`daily-check: ${skipped.length} brand(s) skipped this run (time budget):`, skipped);
  }

  return {
    ok: true,
    checkedAt: checkedAt.toISOString(),
    durationMs: Date.now() - startedAt,
    brandsProcessed: summary.length,
    summary,
    skipped,
  };
}
