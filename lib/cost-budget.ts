/**
 * Monthly LLM-provider spend safeguard (2026-09) - the structural fix
 * for the incident that started this whole investigation:
 * ANTHROPIC_API_KEY silently expired, Claude's real per-call cost
 * (Sonnet at the time) had already drained the Anthropic workspace's
 * entire starter credit within about a week, and nobody found out for
 * 4 days - because nothing in this app tracked real spend anywhere;
 * only each of six separate provider consoles did, and none of them
 * were actually being watched. See lib/provider-pricing.ts for how
 * each check's own real cost is now computed and recorded on the
 * `rankings` row itself (`cost_usd`).
 *
 * This sums that column for the current JST calendar month and
 * compares it against an operator-configured budget after every daily
 * cron run - see checkMonthlyLlmBudget's own comment for why there is
 * deliberately no built-in default budget number.
 */
import type { createAdminClient } from "@/lib/supabase/admin";
import { formatJst, jstMidnight } from "./jst";

// Warn well before the hard ceiling - enough runway to actually react
// (raise the cap, enable a provider's own auto-reload, investigate a
// runaway cost) before anything stops working, rather than finding out
// only once spend has already crossed 100%.
const WARNING_FRACTION = 0.7;

export interface BudgetStatus {
  budgetUsd: number;
  spentUsd: number;
  /** spentUsd / budgetUsd, e.g. 0.85 for 85% of budget used. */
  fraction: number;
  level: "ok" | "warning" | "critical";
}

/**
 * The operator's own monthly ceiling for combined LLM-provider spend
 * across every customer - deliberately NOT given a built-in default
 * number here. Every other budget-shaped constant in this codebase
 * (plan limits, trial length) reflects a real business decision someone
 * made with real numbers in hand; picking an arbitrary default for
 * "how much are we willing to spend on LLM APIs per month" would be
 * exactly the kind of unverified guess this whole feature exists to
 * replace. Unset (see .env.example) means the check below is skipped
 * entirely rather than silently alerting against a made-up number - a
 * missing budget should read as "not configured yet," not as $0.
 */
function monthlyBudgetUsd(): number | null {
  const raw = process.env.MONTHLY_LLM_BUDGET_USD;
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function currentJstMonthStart(): Date {
  const [year, month] = formatJst(new Date(), "yyyy-MM").split("-").map(Number);
  return jstMidnight(year, month - 1, 1);
}

/**
 * Sums `cost_usd` across every rankings row checked_at so far this JST
 * calendar month. Rows with a null cost (a 200 response whose usage
 * data couldn't be parsed - see provider-pricing.ts) are excluded from
 * both the numerator here, on purpose: a null is "we don't actually
 * know what this cost," and silently treating that as $0 would make a
 * real spend problem look smaller than it is, exactly backwards from
 * what a budget guard is for.
 */
export async function getMonthToDateSpendUsd(
  supabase: ReturnType<typeof createAdminClient>
): Promise<number> {
  const monthStart = currentJstMonthStart();
  const { data } = await supabase
    .from("rankings")
    .select("cost_usd")
    .gte("checked_at", monthStart.toISOString())
    .not("cost_usd", "is", null);
  return (data ?? []).reduce((sum, row) => sum + (Number(row.cost_usd) || 0), 0);
}

/** Returns null (skip silently) when MONTHLY_LLM_BUDGET_USD isn't
 *  configured - see monthlyBudgetUsd's own comment. */
export async function checkMonthlyLlmBudget(
  supabase: ReturnType<typeof createAdminClient>
): Promise<BudgetStatus | null> {
  const budgetUsd = monthlyBudgetUsd();
  if (budgetUsd === null) return null;

  const spentUsd = await getMonthToDateSpendUsd(supabase);
  const fraction = spentUsd / budgetUsd;
  const level: BudgetStatus["level"] = fraction >= 1 ? "critical" : fraction >= WARNING_FRACTION ? "warning" : "ok";

  return { budgetUsd, spentUsd, fraction, level };
}

/**
 * Count of "manual" (source='manual') check executions one account has
 * triggered so far this JST calendar month, across every brand it owns -
 * the per-tenant counterpart to checkMonthlyLlmBudget's company-wide
 * total (2026-09). Deliberately COUNT(DISTINCT checked_at), not a plain
 * row count: runPromptCheckNow (lib/prompt-check.ts) inserts one row
 * per provider (6) sharing the exact same `checked_at` for a single
 * check event, so a plain row count would inflate the real "how many
 * times did this account trigger a paid check" figure 6x. Only
 * source='manual' rows count - the daily cron's own rows (source=
 * 'cron', the default) never do, since this exists specifically to cap
 * on-demand/discretionary spend, not the plan-limited daily cost every
 * paying account already expects.
 *
 * Needs the admin client for the same reason getMonthToDateSpendUsd
 * does - reading across every brand an account owns via rankings.
 * brand_id, not a single RLS-scoped row at a time.
 */
export async function getMonthlyManualCheckCount(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<number> {
  const { data: brands } = await supabase.from("brands").select("id").eq("user_id", userId);
  const brandIds = (brands ?? []).map((b) => b.id as string);
  if (brandIds.length === 0) return 0;

  const monthStart = currentJstMonthStart();
  const { data } = await supabase
    .from("rankings")
    .select("checked_at")
    .eq("source", "manual")
    .in("brand_id", brandIds)
    .gte("checked_at", monthStart.toISOString());

  return new Set((data ?? []).map((row) => row.checked_at)).size;
}
