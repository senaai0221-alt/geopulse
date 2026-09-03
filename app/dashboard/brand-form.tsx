"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, Loader2, Target, Globe, Users, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineAlert } from "@/components/ui/inline-alert";
import { AliasSuggestionHint } from "@/components/alias-suggestion-hint";
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
const ALIASES_MAX = 300;
const COMPETITORS_MAX = 300;

export function BrandForm({ businessPriceId }: { businessPriceId: string }) {
  const { t } = useI18n();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  // Controlled only because AliasSuggestionHint needs to read the live
  // brand name and read/write the aliases field - every other field
  // here stays a plain uncontrolled `name` input read via FormData.
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
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
        // formRef.current?.reset() alone doesn't clear `name`/`aliases`
        // - they're controlled (see AliasSuggestionHint's need to read
        // both live) - so React would just redraw them back to their
        // current state right after the native reset.
        formRef.current?.reset();
        setName("");
        setAliases("");
      } catch (err) {
        setErrorCode(err instanceof Error ? err.message : "");
      }
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} noValidate className="flex flex-col gap-4">
      {/* This card sits beside a twin card in a lg:grid-cols-2 layout
          (see settings/page.tsx), so at desktop widths it only ever gets
          HALF the page's width to work with - a plain sm:2-up grid (2x2
          for these 4 fields) keeps every field wide enough for its
          placeholder at every breakpoint without needing a bespoke
          per-column-width split. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name" className="flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            {t("settings.brandName")}
          </Label>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("settings.brandNamePlaceholder")}
            maxLength={NAME_MAX}
            required
          />
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
          <Label htmlFor="aliases" className="flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            {t("settings.brandAliases")}
          </Label>
          <Input
            id="aliases"
            name="aliases"
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            placeholder={t("settings.brandAliasesPlaceholder")}
            maxLength={ALIASES_MAX}
          />
          <p className="text-xs text-slate-400">{t("settings.brandAliasesHint")}</p>
          <AliasSuggestionHint
            brandName={name}
            currentAliases={aliases}
            onAdd={(suggestion) => setAliases((prev) => (prev.trim() ? `${prev}, ${suggestion}` : suggestion))}
          />
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
      {/* Outline, not the default filled/primary style, once the plan
          limit has actually been hit: with PlanLimitAlert's own
          "Businessにアップグレード" button sitting right above it in
          the exact same primary blue, two same-weight CTAs side by
          side read as two equally valid options - when only one of
          them (upgrading) can actually succeed right now. This one
          stays clickable (retrying after upgrading elsewhere still
          works without a page reload), just visually secondary. */}
      <Button type="submit" disabled={isPending} variant={isPlanLimitError ? "outline" : "default"} className="w-fit">
        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
        {t("settings.addBrandButton")}
      </Button>
    </form>
  );
}
