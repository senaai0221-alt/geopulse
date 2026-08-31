"use client";

import { useState, useTransition } from "react";
import { Loader2, Image as ImageIcon, Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";
import { updateWhiteLabelSettings } from "../actions";

/** Business-plan-only: the logo and company name shown on the printed/
 *  PDF report instead of Zonostick's own - lets an agency hand a client
 *  a report that reads as theirs. Both fields are optional; leaving
 *  either blank falls back to Zonostick branding on that piece (see
 *  report/page.tsx). */
export function WhiteLabelForm({
  initialLogoUrl,
  initialCompanyName,
}: {
  initialLogoUrl: string | null;
  initialCompanyName: string | null;
}) {
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setSaved(false);
    startTransition(async () => {
      await updateWhiteLabelSettings(formData);
      setSaved(true);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="report_logo_url" className="flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
          {t("settings.whiteLabelLogoLabel")}
        </Label>
        <Input
          id="report_logo_url"
          name="report_logo_url"
          type="url"
          placeholder="https://example.com/logo.png"
          defaultValue={initialLogoUrl ?? ""}
          maxLength={500}
        />
        <p className="text-xs text-slate-400">{t("settings.whiteLabelLogoHint")}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="report_company_name" className="flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          {t("settings.whiteLabelCompanyLabel")}
        </Label>
        <Input
          id="report_company_name"
          name="report_company_name"
          placeholder={t("settings.whiteLabelCompanyPlaceholder")}
          defaultValue={initialCompanyName ?? ""}
          maxLength={100}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending} size="sm" className="w-fit">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("settings.slackSave")}
        </Button>
        {saved && <span className="text-sm text-emerald-600">{t("settings.slackSaved")}</span>}
      </div>
    </form>
  );
}
