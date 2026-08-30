"use client";

import { useState, useTransition } from "react";
import { Loader2, Slack, HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";
import { updateSlackSettings, sendTestSlackMessage } from "./actions";

export function SlackSettingsForm({
  initialWebhookUrl,
  initialEnabled,
}: {
  initialWebhookUrl: string | null;
  initialEnabled: boolean;
}) {
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; code: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const TEST_MESSAGES: Record<string, string> = {
    webhook_not_set: t("settings.slackTestWebhookNotSet"),
    sent: t("settings.slackTestSent"),
    send_failed: t("settings.slackTestFailed"),
  };

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
        <Label htmlFor="slack_webhook_url">{t("settings.slackWebhookLabel")}</Label>
        <Input
          id="slack_webhook_url"
          name="slack_webhook_url"
          placeholder="https://hooks.slack.com/services/..."
          defaultValue={initialWebhookUrl ?? ""}
        />

        {/* Non-engineers routinely get stuck not knowing where a
            Webhook URL even comes from - a native <details> disclosure
            keeps the steps one click away without permanently taking up
            space in the form. */}
        <details className="group rounded-md border border-border">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground marker:content-none hover:text-foreground">
            <HelpCircle className="h-3.5 w-3.5 shrink-0" />
            {t("settings.slackHowToGetWebhook")}
          </summary>
          <ol className="flex flex-col gap-1.5 border-t border-border px-3 py-3 pl-8 text-xs text-muted-foreground [&>li]:list-decimal">
            <li>{t("settings.slackStep1")}</li>
            <li>{t("settings.slackStep2")}</li>
            <li>{t("settings.slackStep3")}</li>
          </ol>
        </details>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="slack_enabled"
          defaultChecked={initialEnabled}
          className="h-4 w-4 rounded border-input"
        />
        {t("settings.slackEnabled")}
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending} size="sm">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("settings.slackSave")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={handleTest} disabled={isTesting}>
          {isTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Slack className="mr-2 h-4 w-4" />}
          {t("settings.slackTestSend")}
        </Button>
        {saved && <span className="text-sm text-emerald-600">{t("settings.slackSaved")}</span>}
      </div>
      {testResult && (
        <p className={testResult.ok ? "text-sm text-emerald-600" : "text-sm text-destructive"}>
          {TEST_MESSAGES[testResult.code] ?? t("settings.slackTestFailed")}
        </p>
      )}
    </form>
  );
}
