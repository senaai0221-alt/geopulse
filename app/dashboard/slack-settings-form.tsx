"use client";

import { useState, useTransition } from "react";
import { Loader2, Slack } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSlackSettings, sendTestSlackMessage } from "./actions";

export function SlackSettingsForm({
  initialWebhookUrl,
  initialEnabled,
}: {
  initialWebhookUrl: string | null;
  initialEnabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setSaved(false);
    startTransition(async () => {
      await updateSlackSettings(formData);
      setSaved(true);
    });
  }

  async function handleTest() {
    setIsTesting(true);
    setTestResult(null);
    const result = await sendTestSlackMessage();
    setTestResult(result);
    setIsTesting(false);
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="slack_webhook_url">Slack Incoming Webhook URL</Label>
        <Input
          id="slack_webhook_url"
          name="slack_webhook_url"
          placeholder="https://hooks.slack.com/services/..."
          defaultValue={initialWebhookUrl ?? ""}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="slack_enabled"
          defaultChecked={initialEnabled}
          className="h-4 w-4 rounded border-input"
        />
        通知を有効にする
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending} size="sm">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          保存
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={handleTest} disabled={isTesting}>
          {isTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Slack className="mr-2 h-4 w-4" />}
          テスト送信
        </Button>
        {saved && <span className="text-sm text-emerald-600">保存しました</span>}
      </div>
      {testResult && (
        <p className={testResult.ok ? "text-sm text-emerald-600" : "text-sm text-destructive"}>
          {testResult.message}
        </p>
      )}
    </form>
  );
}
