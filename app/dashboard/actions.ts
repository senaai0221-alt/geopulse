"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { sendSlackMessage, buildTestMessageBlocks } from "@/lib/slack";

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

  if (!name) throw new Error("ブランド名は必須です");

  const { error } = await supabase.from("brands").insert({
    user_id: user.id,
    name,
    domain: domain || null,
    competitors,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function createPrompt(formData: FormData) {
  const { supabase } = await requireUser();

  const brandId = String(formData.get("brand_id") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();

  if (!brandId || !text) throw new Error("プロンプト内容は必須です");

  const { error } = await supabase.from("prompts").insert({
    brand_id: brandId,
    text,
    category: category || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
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

export async function sendTestSlackMessage(): Promise<{ ok: boolean; message: string }> {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("slack_webhook_url")
    .eq("id", user.id)
    .single();

  if (!profile?.slack_webhook_url) {
    return { ok: false, message: "Slack Webhook URLが設定されていません。" };
  }

  try {
    await sendSlackMessage(
      profile.slack_webhook_url,
      buildTestMessageBlocks(),
      "Zonostick: Slack接続テスト"
    );
    return { ok: true, message: "テストメッセージを送信しました。" };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "送信に失敗しました。",
    };
  }
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
