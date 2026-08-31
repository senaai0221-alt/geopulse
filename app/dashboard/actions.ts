"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { sendSlackMessage, buildTestMessageBlocks, buildFeedbackBlocks, type FeedbackInput } from "@/lib/slack";
import { assertCanAddBrand, assertCanAddPrompt } from "@/lib/plan-limits";

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

  const [{ data: profile }, { count: promptCount }] = await Promise.all([
    supabase.from("profiles").select("plan").eq("id", user.id).single(),
    supabase
      .from("prompts")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brandId),
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
 */
export async function updateWhiteLabelSettings(formData: FormData) {
  const { supabase, user } = await requireUser();

  const logoUrl = truncate(String(formData.get("report_logo_url") ?? "").trim(), 500);
  const companyName = truncate(String(formData.get("report_company_name") ?? "").trim(), 100);

  const { error } = await supabase
    .from("profiles")
    .update({
      report_logo_url: logoUrl || null,
      company_name: companyName || null,
    })
    .eq("id", user.id);

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
