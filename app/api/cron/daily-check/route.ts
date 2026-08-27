import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { runGeoQuery, type LlmProvider } from "@/lib/geo-engine";
import { sendDailySummary, type RankingChange } from "@/lib/slack";

export const dynamic = "force-dynamic";
// Vercel Hobby plan caps function duration at 60s; Pro/Enterprise allow more.
// Raise this if you're on a paid plan and have many brands/prompts to check.
export const maxDuration = 60;

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
      // Grab the previous measurement per provider before writing new rows,
      // so we can diff against it for anomaly detection.
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

      const rowsToInsert = results.map((result) => ({
        brand_id: brand.id,
        prompt_id: prompt.id,
        provider: result.provider,
        mentioned: result.mentioned,
        rank_position: result.rankPosition,
        sentiment: result.sentiment,
        competitors_mentioned: result.competitorsMentioned,
        citations: result.citations,
        raw_response: result.rawResponse || null,
        error: result.error ?? null,
        checked_at: checkedAt.toISOString(),
      }));

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
    })
  );

  return { anomalies, totalChecks, mentionedCount };
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return await runDailyCheck();
  } catch (err) {
    console.error("daily-check crashed:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      { status: 500 }
    );
  }
}

async function runDailyCheck() {
  const supabase = createAdminClient();
  const checkedAt = new Date();

  const { data: brands, error: brandsError } = await supabase
    .from("brands")
    .select("id, user_id, name, competitors, rank_drop_threshold")
    .eq("is_active", true);

  if (brandsError) {
    return NextResponse.json({ error: brandsError.message }, { status: 500 });
  }

  const summary: Record<string, unknown>[] = [];

  for (const brand of (brands ?? []) as BrandRow[]) {
    const { data: prompts } = await supabase
      .from("prompts")
      .select("id, brand_id, text")
      .eq("brand_id", brand.id)
      .eq("is_active", true);

    if (!prompts || prompts.length === 0) continue;

    const { anomalies, totalChecks, mentionedCount } = await processBrand(
      supabase,
      brand,
      prompts as PromptRow[],
      checkedAt
    );

    summary.push({
      brandId: brand.id,
      brandName: brand.name,
      totalChecks,
      anomalies: anomalies.length,
    });

    // Send Slack notification for this brand's owner, if configured.
    const { data: profile } = await supabase
      .from("profiles")
      .select("slack_webhook_url, slack_enabled")
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
      } catch (err) {
        console.error(`Failed to send Slack summary for brand ${brand.id}:`, err);
      }
    }
  }

  return NextResponse.json({ ok: true, checkedAt: checkedAt.toISOString(), summary });
}
