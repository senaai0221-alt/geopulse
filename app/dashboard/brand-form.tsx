"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, Loader2, Target, Globe, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineAlert } from "@/components/ui/inline-alert";
import { useI18n } from "@/lib/i18n/context";
import { translateActionError } from "@/lib/i18n/action-error";
import { createBrand } from "./actions";
import { PlanLimitAlert } from "./plan-limit-alert";

// Server-side (createBrand/updateBrand in actions.ts) truncates to the
// same caps regardless - these are just so a viewer sees the limit
// coming instead of typing far past it and having it silently clipped
// on save.
const NAME_MAX = 100;
const DOMAIN_MAX = 200;
const COMPETITORS_MAX = 300;

export function BrandForm({ businessPriceId }: { businessPriceId: string }) {
  const { t } = useI18n();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  // Stored as a code, not a pre-translated string, and translated at
  // render time (see `error` below) - so if the viewer switches the
  // JA/EN toggle while an error is showing, it re-translates immediately
  // instead of staying stuck in whichever language it was set in.
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const errorType = errorCode?.split(":")[0];
  const isPlanLimitError = errorType === "no_free_tier" || errorType === "brand_limit";
  const error =
    !errorCode || isPlanLimitError
      ? null
      : errorCode === "validation.required"
      ? t(errorCode)
      : translateActionError(t, errorCode, "settings.addBrandFailed");

  function handleSubmit(formData: FormData) {
    setErrorCode(null);
    // The form is `noValidate` (see below) so this check - not the
    // browser's native validation bubble - is what runs on an empty
    // name: a native bubble is drawn in the browser's own UI language,
    // not the app's locale, which reads as untranslated text leaking
    // through the moment someone submits blank in EN mode.
    if (!String(formData.get("name") ?? "").trim()) {
      setErrorCode("validation.required");
      return;
    }
    startTransition(async () => {
      try {
        await createBrand(formData);
        formRef.current?.reset();
      } catch (err) {
        setErrorCode(err instanceof Error ? err.message : "");
      }
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name" className="flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            {t("settings.brandName")}
          </Label>
          <Input id="name" name="name" placeholder={t("settings.brandNamePlaceholder")} maxLength={NAME_MAX} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="domain" className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            {t("settings.brandDomain")}
          </Label>
          <Input id="domain" name="domain" placeholder="example.com" maxLength={DOMAIN_MAX} />
          <p className="text-xs text-slate-400">{t("settings.brandDomainHint")}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="competitors" className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            {t("settings.brandCompetitors")}
          </Label>
          <Input
            id="competitors"
            name="competitors"
            placeholder={t("settings.brandCompetitorsPlaceholder")}
            maxLength={COMPETITORS_MAX}
          />
          <p className="text-xs text-slate-400">{t("settings.brandCompetitorsHint")}</p>
        </div>
      </div>
      {isPlanLimitError && errorCode ? (
        <PlanLimitAlert code={errorCode} businessPriceId={businessPriceId} />
      ) : (
        error && <InlineAlert>{error}</InlineAlert>
      )}
      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
        {t("settings.addBrandButton")}
      </Button>
    </form>
  );
}
