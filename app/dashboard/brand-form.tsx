"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineAlert } from "@/components/ui/inline-alert";
import { useI18n } from "@/lib/i18n/context";
import { translateActionError } from "@/lib/i18n/action-error";
import { createBrand } from "./actions";

export function BrandForm() {
  const { t } = useI18n();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createBrand(formData);
        formRef.current?.reset();
      } catch (err) {
        setError(translateActionError(t, err instanceof Error ? err.message : "", "settings.addBrandFailed"));
      }
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">{t("settings.brandName")}</Label>
          <Input id="name" name="name" placeholder={t("settings.brandNamePlaceholder")} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="domain">{t("settings.brandDomain")}</Label>
          <Input id="domain" name="domain" placeholder="example.com" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="competitors">{t("settings.brandCompetitors")}</Label>
          <Input id="competitors" name="competitors" placeholder={t("settings.brandCompetitorsPlaceholder")} />
        </div>
      </div>
      {error && <InlineAlert>{error}</InlineAlert>}
      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
        {t("settings.addBrandButton")}
      </Button>
    </form>
  );
}
