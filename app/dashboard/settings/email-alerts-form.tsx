"use client";

import { useState, useTransition } from "react";
import { Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { useFormDirtyGuard } from "../unsaved-changes-context";
import { updateEmailAlertSettings, sendTestEmailAlert } from "../actions";

/**
 * The default/primary notification channel - Slack (slack-settings-
 * form.tsx) is now positioned as an optional, additional one further
 * down the settings page. `initialEmail` is the account's own sign-in
 * address unless the user has already pointed alerts somewhere else
 * (profiles.notification_email) - editing and saving this field writes
 * that override; clearing it back to blank resets to the account
 * address. Deliberately unverified (no confirmation link) - same
 * zero-setup-friction tradeoff as the Slack webhook URL field below.
 */
export function EmailAlertsForm({
  initialEmail,
  initialEnabled,
  highlightTestButton = false,
}: {
  initialEmail: string;
  initialEnabled: boolean;
  /** True when the visitor arrived via the onboarding guide's step-3
   *  CTA (see dashboard/page.tsx + settings/page.tsx's `highlight`
   *  query param) - draws the same pulsing blue ring used on the
   *  dashboard's prompt input onto the test-send button here. */
  highlightTestButton?: boolean;
}) {
  const { t } = useI18n();
  const { markDirty, markClean } = useFormDirtyGuard();
  const [isPending, startTransition] = useTransition();
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; code: string } | null>(null);
  const [email, setEmail] = useState(initialEmail);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; emailChanged: boolean } | null>(null);

  const TEST_MESSAGES: Record<string, string> = {
    no_email: t("settings.emailTestNoEmail"),
    sent: t("settings.emailTestSent"),
    send_failed: t("settings.emailTestFailed"),
  };

  function handleSubmit(formData: FormData) {
    setSaveResult(null);
    const submittedEmail = String(formData.get("notification_email") ?? "").trim();
    const emailChanged = submittedEmail !== initialEmail.trim();
    startTransition(async () => {
      const result = await updateEmailAlertSettings(formData);
      setSaveResult({ ok: result.ok, emailChanged: result.ok && emailChanged });
      if (result.ok) markClean();
    });
  }

  async function handleTest() {
    setIsTesting(true);
    setTestResult(null);
    const result = await sendTestEmailAlert();
    setTestResult(result);
    setIsTesting(false);
  }

  return (
    <form action={handleSubmit} onChange={markDirty} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notification_email" className="flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
          {t("settings.emailAlertsAddressLabel")}
        </Label>
        <Input
          id="notification_email"
          name="notification_email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setSaveResult(null);
          }}
          maxLength={254}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="email_alerts_enabled"
          defaultChecked={initialEnabled}
          className="h-4 w-4 rounded border-input"
        />
        {t("settings.emailAlertsToggleLabel")}
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending} size="sm">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("settings.slackSave")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleTest}
          disabled={isTesting}
          className={cn(highlightTestButton && "onboarding-glow ring-2 ring-primary/40")}
        >
          {isTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
          {t("settings.slackTestSend")}
        </Button>
        {saveResult?.ok && (
          <span className="text-sm text-emerald-600">
            {saveResult.emailChanged ? t("settings.emailAlertsAddressChanged") : t("settings.slackSaved")}
          </span>
        )}
      </div>
      {saveResult?.ok === false && (
        <p className="text-sm text-destructive">{t("settings.emailAlertsInvalidAddress")}</p>
      )}
      {testResult && (
        <p className={testResult.ok ? "text-sm text-emerald-600" : "text-sm text-destructive"}>
          {TEST_MESSAGES[testResult.code] ?? t("settings.emailTestFailed")}
        </p>
      )}
    </form>
  );
}
