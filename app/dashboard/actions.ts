"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { sendSlackMessage, buildTestMessageBlocks, buildFeedbackBlocks, type FeedbackInput } from "@/lib/slack";
import { sendTestAlertEmail } from "@/lib/email";
import { assertCanAddBrand, assertCanAddPrompt } from "@/lib/plan-limits";
import { generateReportInsights, type ReportInsightsInput } from "@/lib/report-insights";

// Defense-in-depth against pathological input (a multi-thousand-character
// name/prompt, hundreds of "competitors", etc.) that could otherwise
// blow up table/chart layouts or bloat every query result touching this
// row - every write path for these fields goes through this file, so
// clamping here holds regardless of what the client sent (its own
// maxLength attributes are just a head start, never trusted alone).
const LIMITS = {
  brandName: 100,
  domain: 200,
  competitorItem: 60,
  competitorCount: 20,
  promptText: 300,
  category: 50,
  feedbackMessage: 3000,
} as const;

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function parseCompetitors(raw: string): string[] {
  return raw
    .split(",")
    .map((c) => truncate(c.trim(), LIMITS.competitorItem))
    .filter(Boolean)
    .slice(0, LIMITS.competitorCount);
}

async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user: user! };
}

export async function createBrand(formData: FormData) {
  const { supabase, user } = await requireUser();

  const name = truncate(String(formData.get("name") ?? "").trim(), LIMITS.brandName);
  const domain = truncate(String(formData.get("domain") ?? "").trim(), LIMITS.domain);
  const competitors = parseCompetitors(String(formData.get("competitors") ?? ""));

  if (!name) throw new Error("brand_name_required");

  const [{ data: profile }, { count: brandCount }] = await Promise.all([
    supabase.from("profiles").select("plan").eq("id", user.id).single(),
    supabase
      .from("brands")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);
  assertCanAddBrand(profile?.plan, brandCount ?? 0);

  const { error } = await supabase.from("brands").insert({
    user_id: user.id,
    name,
    domain: domain || null,
    competitors,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function updateBrand(formData: FormData) {
  const { supabase } = await requireUser();

  const brandId = String(formData.get("brand_id") ?? "");
  const name = truncate(String(formData.get("name") ?? "").trim(), LIMITS.brandName);
  const domain = truncate(String(formData.get("domain") ?? "").trim(), LIMITS.domain);
  const competitors = parseCompetitors(String(formData.get("competitors") ?? ""));

  if (!brandId || !name) throw new Error("brand_name_required");

  // RLS (brands_crud_own) already scopes this update to brands the
  // caller owns - no need to re-check ownership here.
  const { error } = await supabase
    .from("brands")
    .update({ name, domain: domain || null, competitors })
    .eq("id", brandId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
}

export async function deleteBrand(formData: FormData) {
  const { supabase } = await requireUser();
  const brandId = String(formData.get("brand_id") ?? "");
  if (!brandId) return;

  // `on delete cascade` on prompts/rankings/alerts (see
  // supabase/schema.sql) takes every measurement for this brand with it.
  const { error } = await supabase.from("brands").delete().eq("id", brandId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
}

export async function createPrompt(formData: FormData) {
  const { supabase, user } = await requireUser();

  const brandId = String(formData.get("brand_id") ?? "");
  const text = truncate(String(formData.get("text") ?? "").trim(), LIMITS.promptText);
  const category = truncate(String(formData.get("category") ?? "").trim(), LIMITS.category);

  if (!brandId || !text) throw new Error("prompt_text_required");

  // The cap is account-wide (total prompts across every brand the user
  // owns), not per-brand - RLS (prompts_crud_own, see supabase/schema.sql)
  // already scopes this select to the caller's own prompts, so counting
  // with no brand_id filter gives the account total.
  const [{ data: profile }, { count: promptCount }] = await Promise.all([
    supabase.from("profiles").select("plan").eq("id", user.id).single(),
    supabase.from("prompts").select("id", { count: "exact", head: true }),
  ]);
  assertCanAddPrompt(profile?.plan, promptCount ?? 0);

  const { data: newPrompt, error } = await supabase
    .from("prompts")
    .insert({
      brand_id: brandId,
      text,
      category: category || null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  // Returned so the client can kick off an immediate first-time
  // measurement (see PromptForm) instead of leaving the user staring at
  // an empty row until tomorrow's cron run.
  return { id: newPrompt.id as string };
}

export async function deletePrompt(formData: FormData) {
  const { supabase } = await requireUser();
  const promptId = String(formData.get("prompt_id") ?? "");
  if (!promptId) return;

  const { error } = await supabase.from("prompts").delete().eq("id", promptId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

/**
 * Renames (or clears) an existing prompt's group/category label.
 * RLS (prompts_crud_own) already scopes this to prompts the caller owns
 * via their brand - no explicit ownership check needed here.
 * revalidatePath re-fetches /dashboard's server-rendered data, so the
 * group headings and table re-render with the new grouping immediately -
 * no client-side cache or manual router.refresh() to keep in sync.
 */
export async function updatePromptCategory(formData: FormData) {
  const { supabase } = await requireUser();
  const promptId = String(formData.get("prompt_id") ?? "");
  const category = truncate(String(formData.get("category") ?? "").trim(), LIMITS.category);
  if (!promptId) return;

  const { error } = await supabase
    .from("prompts")
    .update({ category: category || null })
    .eq("id", promptId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

/**
 * White-label branding for the Business-plan A4 report (logo + company
 * name shown in the report header instead of Zonostick's own). No plan
 * check here - the settings card that renders this form is already
 * Business-gated (see settings/page.tsx), and report/page.tsx falls
 * back to Zonostick branding on its own if a non-Business profile
 * somehow has these set (e.g. after a downgrade) or if they're empty.
 *
 * Each field is only written if its key is actually present in
 * `formData` - not merely non-empty. The company-name box still submits
 * both fields together on its own "Save" button (unchanged), but the
 * logo uploader (white-label-form.tsx) calls this on its own, right
 * after a successful Storage upload, with only report_logo_url set -
 * an empty-string company_name would otherwise silently null out
 * whatever company name was already saved. Sending an explicit empty
 * string for a field (e.g. the logo "Remove" button) still clears it,
 * same as before - only a wholly *absent* key is left untouched.
 */
export async function updateWhiteLabelSettings(formData: FormData) {
  const { supabase, user } = await requireUser();

  const update: { report_logo_url?: string | null; company_name?: string | null } = {};
  if (formData.has("report_logo_url")) {
    const logoUrl = truncate(String(formData.get("report_logo_url") ?? "").trim(), 500);
    update.report_logo_url = logoUrl || null;
  }
  if (formData.has("report_company_name")) {
    const companyName = truncate(String(formData.get("report_company_name") ?? "").trim(), 100);
    update.company_name = companyName || null;
  }
  if (Object.keys(update).length === 0) return;

  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/report");
}

/**
 * Saves one field ("commentary" or "next_actions") of the report's
 * free-text notes for one (brand, month) - see report_notes in
 * supabase/schema.sql. Upserting with only the one changed column in
 * the payload leaves the other field (set independently, from the
 * other box on the page) untouched on conflict, rather than clobbering
 * it with null.
 */
export async function upsertReportNotes(formData: FormData): Promise<{ ok: boolean }> {
  const { supabase } = await requireUser();

  const brandId = String(formData.get("brand_id") ?? "");
  const month = String(formData.get("month") ?? "");
  const field = String(formData.get("field") ?? "");
  const value = truncate(String(formData.get("value") ?? ""), 4000);

  if (!brandId || !/^\d{4}-\d{2}$/.test(month) || (field !== "commentary" && field !== "next_actions")) {
    return { ok: false };
  }

  const { error } = await supabase.from("report_notes").upsert(
    { brand_id: brandId, month, [field]: value || null, updated_at: new Date().toISOString() },
    { onConflict: "brand_id,month" }
  );
  if (error) return { ok: false };

  revalidatePath("/dashboard/report");
  return { ok: true };
}

/**
 * Writes both report_notes fields at once from an LLM-generated first
 * draft (see lib/report-insights.ts) - either the report page's
 * auto-generate-on-first-view trigger for a month with no saved notes
 * yet, or the "Regenerate with AI" button next to either textarea.
 *
 * `data` is the same aggregate numbers the report page itself already
 * computed and rendered for this brand/month (KPIs, per-LLM stats,
 * competitor share, category breakdown) - passed through from the
 * client rather than re-queried here, so the generated commentary can
 * never end up describing different numbers than the charts sitting
 * next to it on the page.
 *
 * Ownership is verified explicitly (not just left to the report_notes
 * upsert's own RLS) before the paid OpenAI call runs, so an arbitrary
 * brandId can't be used to spend API credits against a brand that
 * doesn't belong to the caller even if the eventual write would fail
 * anyway.
 */
export async function generateReportNotes(
  brandId: string,
  month: string,
  data: ReportInsightsInput
): Promise<{ ok: boolean; commentary?: string; nextActions?: string }> {
  const { supabase } = await requireUser();

  if (!brandId || !/^\d{4}-\d{2}$/.test(month)) return { ok: false };

  const { data: brand } = await supabase.from("brands").select("id").eq("id", brandId).single();
  if (!brand) return { ok: false };

  const insights = await generateReportInsights(data);
  if (!insights) return { ok: false };

  const commentary = truncate(insights.commentary, 4000);
  const nextActions = truncate(insights.nextActions, 4000);

  const { error } = await supabase.from("report_notes").upsert(
    {
      brand_id: brandId,
      month,
      commentary: commentary || null,
      next_actions: nextActions || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "brand_id,month" }
  );
  if (error) return { ok: false };

  revalidatePath("/dashboard/report");
  return { ok: true, commentary, nextActions };
}

export async function updateSlackSettings(formData: FormData) {
  const { supabase, user } = await requireUser();

  const webhookUrl = String(formData.get("slack_webhook_url") ?? "").trim();
  const enabled = formData.get("slack_enabled") === "on";

  const { error } = await supabase
    .from("profiles")
    .update({
      slack_webhook_url: webhookUrl || null,
      slack_enabled: enabled,
    })
    .eq("id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

/**
 * Email is the default notification channel (see
 * app/dashboard/settings/email-alerts-form.tsx) - unlike Slack, there's
 * no address to configure, just an on/off toggle against the account's
 * own (already-verified, sign-in) email address.
 */
export async function updateEmailAlertSettings(formData: FormData) {
  const { supabase, user } = await requireUser();

  const enabled = formData.get("email_alerts_enabled") === "on";

  const { error } = await supabase
    .from("profiles")
    .update({ email_alerts_enabled: enabled })
    .eq("id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/settings");
}

// Returns a code (never user-facing text) - see sendTestSlackMessage
// above for why.
export async function sendTestEmailAlert(): Promise<{ ok: boolean; code: string }> {
  const { user } = await requireUser();
  if (!user.email) return { ok: false, code: "no_email" };

  try {
    await sendTestAlertEmail(user.email);
    return { ok: true, code: "sent" };
  } catch {
    return { ok: false, code: "send_failed" };
  }
}

// Returns a code (never user-facing text) - see lib/i18n/action-error.ts's
// sibling mapping in slack-settings-form.tsx for why: this runs before any
// locale is known.
export async function sendTestSlackMessage(): Promise<{ ok: boolean; code: string }> {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("slack_webhook_url")
    .eq("id", user.id)
    .single();

  if (!profile?.slack_webhook_url) {
    return { ok: false, code: "webhook_not_set" };
  }

  try {
    await sendSlackMessage(
      profile.slack_webhook_url,
      buildTestMessageBlocks(),
      "Zonostick: Slack connection test"
    );
    return { ok: true, code: "sent" };
  } catch {
    return { ok: false, code: "send_failed" };
  }
}

const FEEDBACK_TYPES = new Set(["bug", "feature", "other"]);

/**
 * Saves a Help-page bug report / feature request (feedback table - see
 * supabase/schema.sql) and best-effort notifies the operator's own admin
 * Slack channel, distinct from the per-user webhook configured in
 * Settings (that one is for the user's own brand-tracking alerts, not
 * feedback about the product). The DB row is the durable record; if
 * FEEDBACK_SLACK_WEBHOOK_URL isn't set, or the Slack call fails, the
 * submission still succeeds since the row is already saved.
 */
export async function submitFeedback(formData: FormData): Promise<{ ok: boolean; code?: string }> {
  const { supabase, user } = await requireUser();

  const typeRaw = String(formData.get("type") ?? "");
  const type = (FEEDBACK_TYPES.has(typeRaw) ? typeRaw : "other") as FeedbackInput["type"];
  const message = truncate(String(formData.get("message") ?? "").trim(), LIMITS.feedbackMessage);
  const pageUrl = String(formData.get("page_url") ?? "");
  const userAgent = String(formData.get("user_agent") ?? "");

  if (!message) return { ok: false, code: "validation.required" };

  const email = user.email ?? "";

  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    email,
    type,
    message,
    page_url: pageUrl || null,
    user_agent: userAgent || null,
  });
  if (error) return { ok: false, code: "feedback_save_failed" };

  const webhookUrl = process.env.FEEDBACK_SLACK_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await sendSlackMessage(
        webhookUrl,
        buildFeedbackBlocks({ type, message, email, pageUrl, userAgent }),
        `Zonostick フィードバック (${type}): ${email}`
      );
    } catch (err) {
      // The submission is already durably saved above - a failed Slack
      // notification must not turn into a failure the user sees.
      console.error("submitFeedback: Slack notification failed:", err);
    }
  }

  return { ok: true };
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
