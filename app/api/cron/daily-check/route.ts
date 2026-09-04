import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { createAdminClient } from "@/lib/supabase/admin";
import { runGeoQuery, type LlmProvider } from "@/lib/geo-engine";
import { sendDailySummary, sendSlackMessage, buildBudgetAlertBlocks, type RankingChange } from "@/lib/slack";
import { sendAlertEmail } from "@/lib/email";
import { buildAnomalyMessage, buildRecommendGapMessage, RECOMMEND_GAP_ALERT_THRESHOLD_PT } from "@/lib/alert-message";
import { findRomajiNearMiss } from "@/lib/romaji";
import { checkMonthlyLlmBudget } from "@/lib/cost-budget";

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
  aliases: string[];
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
  // Numerator for the brand-level "露出はあるが好意的な言及は少数派"
  // gap check run once per brand after this function returns (see
  // handleBrand) - same denominator (totalChecks) as mentionedCount, by
  // design (see DailyStatsPoint/KpiSet's own comments on the dashboard/
  // report side of this same 2026-09 AI推奨率 feature).
  let positiveCount = 0;

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
          brandAliases: brand.aliases ?? [],
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
              // A thrown call is genuinely $0 (see emptyResult's own
              // comment) - explicit rather than falling through to
              // null, which lib/cost-budget.ts's monthly SUM treats as
              // "unknown" and excludes rather than counting as free.
              cost_usd: result.costUsd,
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
            cost_usd: result.costUsd,
            checked_at: checkedAt.toISOString(),
          };
        });

        // .select() so any alert built from this same batch (below) can
        // link directly to the exact rankings row that triggered it
        // (alerts.ranking_id) - a reader (or a script debugging a
        // reported mismatch) can then always trace an alert back to the
        // literal row it came from, rather than trusting that "the
        // latest row for this prompt/provider" is still the same one.
        const { data: insertedRows, error: insertError } = await supabase
          .from("rankings")
          .insert(rowsToInsert)
          .select("id, provider");
        if (insertError) {
          console.error(`Failed to insert rankings for prompt ${prompt.id}:`, insertError.message);
          return;
        }
        const rankingIdByProvider = new Map<string, string>();
        for (const row of insertedRows ?? []) {
          rankingIdByProvider.set(row.provider, row.id);
        }

        for (const result of results) {
          if (result.error) continue;
          totalChecks += 1;
          if (result.mentioned) {
            mentionedCount += 1;
            if (result.sentiment === "positive") positiveCount += 1;
          }

          const previous = previousByProvider.get(result.provider);
          const wasMentioned = previous?.mentioned ?? false;
          const previousRank = previous?.rank_position ?? null;

          let isAnomaly = false;
          let severity: "info" | "warning" | "critical" = "info";

          // A "worsened rank" anomaly is ONLY ever the second branch
          // below, gated on both ranks being real, non-null numbers -
          // this is the invariant the 2026-09 "2位→12位" false-alert
          // incident violated upstream (a fabricated rank_position from
          // lib/geo-engine.ts reaching here as if it were real; see that
          // file's buildResult/extractListItems for the actual fix).
          // Asserting it explicitly here, rather than just relying on
          // the condition below being written correctly, means a future
          // change to this block can't silently let a null-backed
          // "worsened" anomaly slip through without this comment/check
          // having to be touched too.
          if (wasMentioned && !result.mentioned) {
            isAnomaly = true;
            severity = "critical";
          } else if (
            previousRank !== null &&
            result.rankPosition !== null &&
            result.rankPosition - previousRank >= brand.rank_drop_threshold
          ) {
            isAnomaly = true;
            severity = "warning";
          } else if (wasMentioned && result.mentioned && previousRank !== null && result.rankPosition === null) {
            // Still mentioned, but a real rank number became unknown -
            // e.g. the brand moved from a ranked list into unranked
            // prose, or a response this session's stricter, no-
            // fabrication parsing (lib/geo-engine.ts's extractListItems/
            // firstParagraph scoping, the "17位" incident fix) now
            // correctly reports as "can't determine a position" instead
            // of guessing one. Before this branch existed, this
            // transition fired neither branch above and produced
            // literally zero signal anywhere (2026-09 audit: 41 real
            // occurrences over 8 days, accelerating - 18 in the most
            // recent single day - as those same parsing fixes shipped).
            // That silence was the intended, deliberate consequence of
            // this codebase's "never fabricate a number" design
            // philosophy for the rank ITSELF, but it left the operator
            // with no way to even notice the rank had gone from known to
            // unknown, which is a real, separate signal worth surfacing
            // - just not at the same urgency as a genuine disappearance
            // or a measured worsening (see buildDailySummaryBlocks/
            // sendAlertEmail's own severity-based gating for how "info"
            // is kept quieter than "critical"/"warning").
            isAnomaly = true;
            severity = "info";
          }

          if (isAnomaly) {
            // Only for a "disappeared" (critical) anomaly - a hedge
            // against exactly the ドコモ incident (2026-09): the
            // deterministic matcher, correctly, found no exact mention
            // (mechanical romaji included - see lib/romaji.ts), but a
            // near-miss Latin spelling in the raw response is a real
            // signal that the LLM likely did mention the brand, just in
            // a genuine romanization that diverges from strict
            // phonetic Hepburn. See buildAnomalyMessage's own handling
            // of `possibleMismatch` - this never changes `mentioned`
            // or the rank itself, only adds a caveat asking the reader
            // to double-check before acting on the alert.
            const possibleMismatch =
              severity === "critical" ? findRomajiNearMiss(result.rawResponse ?? "", brand.name) : null;

            const change: RankingChange = {
              brandName: brand.name,
              promptText: prompt.text,
              provider: result.provider,
              previousRank,
              currentRank: result.rankPosition,
              mentioned: result.mentioned,
              severity,
              possibleMismatch,
            };

            // A "critical" (disappeared) anomaly must never carry a
            // current rank number; a "warning" (worsened) one must
            // always carry both; an "info" (rank became unknown) one
            // must carry a real previous rank but no current one - if
            // any invariant is ever violated (a future edit above
            // changes what triggers isAnomaly without updating this),
            // fail loudly in Sentry rather than silently writing/sending
            // a message that names a rank number the underlying data
            // doesn't actually support.
            const invariantOk =
              severity === "critical"
                ? change.currentRank === null
                : severity === "warning"
                  ? change.previousRank !== null && change.currentRank !== null
                  : change.previousRank !== null && change.currentRank === null;
            if (!invariantOk) {
              Sentry.captureMessage("daily-check: anomaly rank invariant violated", {
                level: "error",
                extra: { change, severity },
              });
            }

            anomalies.push(change);

            await supabase.from("alerts").insert({
              user_id: brand.user_id,
              brand_id: brand.id,
              prompt_id: prompt.id,
              provider: result.provider,
              severity,
              message: buildAnomalyMessage(change),
              previous_rank: previousRank,
              current_rank: result.rankPosition,
              // Traces this alert back to the exact rankings row that
              // triggered it, so a reader (dashboard, email, or a script
              // debugging a reported mismatch) is never guessing "the
              // latest row for this prompt/provider" - that row can have
              // moved on by the time anyone looks, which is exactly what
              // produced the 2026-09 "メール・ダッシュボード不一致" report.
              ranking_id: rankingIdByProvider.get(result.provider) ?? null,
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

  return { anomalies, totalChecks, mentionedCount, positiveCount };
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
    Sentry.captureException(err, { tags: { job: "daily-check" } });
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
    .select("id, user_id, name, aliases, competitors, rank_drop_threshold, profiles!inner(plan)")
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

      const { anomalies, totalChecks, mentionedCount, positiveCount } = await processBrand(
        supabase,
        brand,
        prompts as PromptRow[],
        checkedAt
      );

      // Brand-level (not per-prompt/provider) gap check, 2026-09: a
      // brand can carry a high AI露出率 built mostly out of neutral/
      // negative mentions with nothing on that one number making that
      // visible - see lib/alert-message.ts's buildRecommendGapMessage
      // for the full reasoning. Computed once per brand per run, after
      // processBrand has the day's real totals; written straight to
      // `alerts` (prompt_id/provider/ranking_id null - there's no
      // single cell this is "about") rather than folded into the
      // per-row `anomalies` array above, whose RankingChange shape
      // assumes exactly one prompt/provider. Kept at "info" like the
      // rank-became-unknown case: a real, worth-surfacing signal, but
      // never urgent enough for the inbox alert (see below, and
      // lib/email.ts's own comment on why "info" never reaches it).
      let gapMessage: string | null = null;
      if (totalChecks > 0) {
        const exposureRatePct = (mentionedCount / totalChecks) * 100;
        const recommendRatePct = (positiveCount / totalChecks) * 100;
        if (exposureRatePct - recommendRatePct >= RECOMMEND_GAP_ALERT_THRESHOLD_PT) {
          gapMessage = buildRecommendGapMessage(brand.name, exposureRatePct, recommendRatePct);
          await supabase.from("alerts").insert({
            user_id: brand.user_id,
            brand_id: brand.id,
            prompt_id: null,
            provider: null,
            severity: "info",
            message: gapMessage,
            previous_rank: null,
            current_rank: null,
            ranking_id: null,
          });
        }
      }

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
            gapMessage,
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
      //
      // "info" anomalies (rank went from a real number to unknown, but
      // the brand is still mentioned - see the third isAnomaly branch
      // above) are deliberately excluded here: buildAlertEmailHtml's
      // subject/copy ("重要な変動を検知しました") is written for a real
      // drop or disappearance, and sending that same urgent wording for
      // "we just don't know the position anymore" would train the
      // reader to stop trusting/opening this email - exactly the outcome
      // the Slack digest's quieter 🟡 treatment (buildDailySummaryBlocks)
      // is meant to avoid. Info anomalies are still written to `alerts`
      // above and visible on the dashboard either way.
      const urgentAnomalies = anomalies.filter((a) => a.severity !== "info");
      const alertTo = profile?.notification_email || profile?.email;
      if (urgentAnomalies.length > 0 && profile?.email_alerts_enabled !== false && alertTo) {
        try {
          await sendAlertEmail(alertTo, { brandName: brand.name, anomalies: urgentAnomalies, checkedAt });
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

  // Checked once, after every brand this run has already written its
  // rankings (cost_usd included) - never gates or delays any brand's
  // own check, only reports on what already happened. See
  // lib/cost-budget.ts for why this silently no-ops until
  // MONTHLY_LLM_BUDGET_USD is actually configured, and its own comment
  // for why a real budget number can't have a safe built-in default.
  let budgetStatus: Awaited<ReturnType<typeof checkMonthlyLlmBudget>> = null;
  try {
    budgetStatus = await checkMonthlyLlmBudget(supabase);
    const adminWebhook = process.env.FEEDBACK_SLACK_WEBHOOK_URL;
    if (budgetStatus && budgetStatus.level !== "ok" && adminWebhook) {
      const level = budgetStatus.level;
      await sendSlackMessage(
        adminWebhook,
        buildBudgetAlertBlocks({ ...budgetStatus, level }),
        level === "critical"
          ? `🔴 月間LLM予算を超過しました ($${budgetStatus.spentUsd.toFixed(2)} / $${budgetStatus.budgetUsd.toFixed(2)})`
          : `🟠 月間LLM予算が閾値に近づいています ($${budgetStatus.spentUsd.toFixed(2)} / $${budgetStatus.budgetUsd.toFixed(2)})`
      );
    }
  } catch (err) {
    // Never let the budget check itself take down an otherwise-
    // successful run - same isolation principle as every per-brand
    // try/catch above.
    console.error("daily-check: budget check failed:", err);
  }

  return {
    ok: true,
    checkedAt: checkedAt.toISOString(),
    durationMs: Date.now() - startedAt,
    brandsProcessed: summary.length,
    summary,
    skipped,
    budgetStatus,
  };
}
