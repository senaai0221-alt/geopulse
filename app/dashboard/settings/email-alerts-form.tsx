"use client";

import { useState, useTransition } from "react";
import { Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { updateEmailAlertSettings, sendTestEmailAlert } from "../actions";

/**
 * The default/primary notification channel - Slack (slack-settings-
 * form.tsx) is now positioned as an optional, additional one further
 * down the settings page. No address field: it always sends to the
 * account's own sign-in email, just an on/off toggle.
 */
export function EmailAlertsForm({
  email,
  initialEnabled,
  highlightTestButton = false,
}: {
  email: string;
  initialEnabled: boolean;
  /** True when the visitor arrived via the onboarding guide's step-3
   *  CTA (see dashboard/page.tsx + settings/page.tsx's `highlight`
   *  query param) - draws the same pulsing blue ring used on the
   *  dashboard's prompt input onto the test-send button here. */
  highlightTestButton?: boolean;
}) {
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; code: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const TEST_MESSAGES: Record<string, string> = {
    no_email: t("settings.emailTestNoEmail"),
    sent: t("settings.emailTestSent"),
    send_failed: t("settings.emailTestFailed"),
  };

  function handleSubmit(formData: FormData) {
    setSaved(false);
    startTransition(async () => {
      await updateEmailAlertSettings(formData);
      setSaved(true);
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
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Mail className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {t("settings.emailAlertsAddressLabel")}: <span className="text-foreground">{email}</span>
        </span>
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
        {saved && <span className="text-sm text-emerald-600">{t("settings.slackSaved")}</span>}
      </div>
      {testResult && (
        <p className={testResult.ok ? "text-sm text-emerald-600" : "text-sm text-destructive"}>
          {TEST_MESSAGES[testResult.code] ?? t("settings.emailTestFailed")}
        </p>
      )}
    </form>
  );
}
