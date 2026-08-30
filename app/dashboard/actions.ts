"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { sendSlackMessage, buildTestMessageBlocks } from "@/lib/slack";
import { assertCanAddBrand, assertCanAddPrompt } from "@/lib/plan-limits";

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

  const name = String(formData.get("name") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  const competitorsRaw = String(formData.get("competitors") ?? "");
  const competitors = competitorsRaw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

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
  const name = String(formData.get("name") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  const competitorsRaw = String(formData.get("competitors") ?? "");
  const competitors = competitorsRaw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

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
  const text = String(formData.get("text") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();

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

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
