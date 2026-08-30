"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { InlineAlert } from "@/components/ui/inline-alert";
import { useI18n } from "@/lib/i18n/context";
import { submitFeedback } from "../actions";

/**
 * Bug report / feature request form. Automatically attaches the
 * submitting user's email/id (server-side, from the session), plus the
 * current page URL and browser/OS string (client-side only - window and
 * navigator don't exist on the server) as hidden metadata sent alongside
 * the message. Saved to the `feedback` table and best-effort relayed to
 * the operator's admin Slack channel - see submitFeedback in ../actions.
 */
export function FeedbackForm() {
  const { t } = useI18n();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setErrorCode(null);
    setSent(false);

    // The form is `noValidate` (see below) so this check - not the
    // browser's native validation bubble - is what runs on an empty
    // message: a native bubble draws in the browser's own UI language,
    // not the app's locale.
    if (!String(formData.get("message") ?? "").trim()) {
      setErrorCode("validation.required");
      return;
    }

    // window/navigator only exist client-side - the metadata the report
    // asked to auto-collect (current URL, browser/OS) has to be read
    // here and passed along, not derived server-side.
    formData.set("page_url", window.location.href);
    formData.set("user_agent", navigator.userAgent);

    startTransition(async () => {
      const result = await submitFeedback(formData);
      if (result.ok) {
        setSent(true);
        formRef.current?.reset();
      } else {
        setErrorCode(result.code ?? "feedback_save_failed");
      }
    });
  }

  const errorText =
    errorCode === "validation.required"
      ? t("validation.required")
      : errorCode
      ? t("feedback.sendFailed")
      : null;

  return (
    <form ref={formRef} action={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="feedback-type">{t("feedback.typeLabel")}</Label>
        <Select id="feedback-type" name="type" defaultValue="bug" className="w-full sm:w-64">
          <option value="bug">{t("feedback.typeBug")}</option>
          <option value="feature">{t("feedback.typeFeature")}</option>
          <option value="other">{t("feedback.typeOther")}</option>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="feedback-message">{t("feedback.messageLabel")}</Label>
        <Textarea
          id="feedback-message"
          name="message"
          placeholder={t("feedback.messagePlaceholder")}
          maxLength={3000}
          required
        />
      </div>
      {errorText && <InlineAlert>{errorText}</InlineAlert>}
      {sent && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {t("feedback.sent")}
        </div>
      )}
      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Send className="mr-2 h-4 w-4" />
        )}
        {t("feedback.submit")}
      </Button>
    </form>
  );
}
