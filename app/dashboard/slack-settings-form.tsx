"use client";

import { useState, useTransition } from "react";
import { Loader2, Slack, HelpCircle, ExternalLink } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";
import { useFormDirtyGuard } from "./unsaved-changes-context";
import { updateSlackSettings, sendTestSlackMessage } from "./actions";

const SLACK_WEBHOOK_SETUP_URL = "https://slack.com/apps/A0F7XDUAZ-incoming-webhooks";

const STEP_KEYS = ["settings.slackStep1", "settings.slackStep2", "settings.slackStep3"] as const;

export function SlackSettingsForm({
  initialWebhookUrl,
  initialEnabled,
}: {
  initialWebhookUrl: string | null;
  initialEnabled: boolean;
}) {
  const { t } = useI18n();
  const { markDirty, markClean } = useFormDirtyGuard();
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
      markClean();
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
    <form action={handleSubmit} onChange={markDirty} className="flex flex-col gap-4">
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
            space in the form. A direct link to Slack's own Incoming
            Webhook setup page (rather than just describing where to find
            it) removes the "now where do I actually go" step entirely. */}
        <details className="group rounded-md border border-border">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground marker:content-none hover:text-foreground">
            <HelpCircle className="h-3.5 w-3.5 shrink-0" />
            {t("settings.slackHowToGetWebhook")}
          </summary>
          <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
            <a
              href={SLACK_WEBHOOK_SETUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit gap-1.5" })}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("settings.slackOpenSetup")}
            </a>
            <ol className="flex flex-col gap-2 text-xs text-muted-foreground">
              {STEP_KEYS.map((key, i) => (
                <li key={key} className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{t(key)}</span>
                </li>
              ))}
            </ol>
          </div>
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
