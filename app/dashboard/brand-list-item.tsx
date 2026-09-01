"use client";

import { useRef, useState, useTransition } from "react";
import { Globe, Tag, Pencil, Trash2, Loader2, Target, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { InlineAlert } from "@/components/ui/inline-alert";
import { useI18n } from "@/lib/i18n/context";
import { translateActionError } from "@/lib/i18n/action-error";
import { updateBrand, deleteBrand } from "./actions";

interface Brand {
  id: string;
  name: string;
  domain: string | null;
  competitors: string[] | null;
  /** false when a plan downgrade pushed this brand past the new plan's
   *  limit (see lib/plan-reconciliation.ts) - paused, not deleted, and
   *  reactivated automatically on the next upgrade. Undefined for any
   *  caller that hasn't selected the column (treated as active). */
  is_active?: boolean;
}

// Server-side (updateBrand in actions.ts) truncates to the same caps
// regardless - see BrandForm for why these exist too.
const NAME_MAX = 100;
const DOMAIN_MAX = 200;
const COMPETITORS_MAX = 300;

/** One row in the brand-management list: view mode by default, an
 *  inline edit form for renaming/updating domain & competitors, and a
 *  delete action - none of which existed before (only adding a brand
 *  was possible). */
export function BrandListItem({ brand }: { brand: Brand }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  // Stored as a code and translated at render time (see `error` below) -
  // see BrandForm for why.
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const error = errorCode === "validation.required" ? t(errorCode) : errorCode ? translateActionError(t, errorCode, "settings.addBrandFailed") : null;
  const formRef = useRef<HTMLFormElement>(null);

  function handleSave(formData: FormData) {
    setErrorCode(null);
    // See BrandForm's handleSubmit for why this manual check (rather than
    // the browser's native `required` validation) is what actually runs.
    if (!String(formData.get("name") ?? "").trim()) {
      setErrorCode("validation.required");
      return;
    }
    startTransition(async () => {
      try {
        await updateBrand(formData);
        setEditing(false);
      } catch (err) {
        setErrorCode(err instanceof Error ? err.message : "");
      }
    });
  }

  function handleDelete() {
    if (!confirm(t("settings.deleteBrandConfirm"))) return;
    const formData = new FormData();
    formData.set("brand_id", brand.id);
    startDeleteTransition(async () => {
      await deleteBrand(formData);
    });
  }

  if (editing) {
    return (
      <form
        ref={formRef}
        action={handleSave}
        noValidate
        className="flex flex-col gap-3 rounded-md border border-primary/40 bg-primary/5 p-3"
      >
        <input type="hidden" name="brand_id" value={brand.id} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`name-${brand.id}`} className="flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            {t("settings.brandName")}
          </Label>
          <Input id={`name-${brand.id}`} name="name" defaultValue={brand.name} maxLength={NAME_MAX} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`domain-${brand.id}`} className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            {t("settings.brandDomain")}
          </Label>
          <Input id={`domain-${brand.id}`} name="domain" defaultValue={brand.domain ?? ""} maxLength={DOMAIN_MAX} />
          <p className="text-xs text-slate-400">{t("settings.brandDomainHint")}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`competitors-${brand.id}`} className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            {t("settings.brandCompetitors")}
          </Label>
          <Input
            id={`competitors-${brand.id}`}
            name="competitors"
            defaultValue={(brand.competitors ?? []).join(", ")}
            maxLength={COMPETITORS_MAX}
          />
          <p className="text-xs text-slate-400">{t("settings.brandCompetitorsHint")}</p>
        </div>
        {error && <InlineAlert>{error}</InlineAlert>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("settings.saveBrand")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
            {t("settings.cancel")}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-medium">{brand.name}</span>
          {brand.is_active === false && (
            <Badge variant="secondary" className="shrink-0 text-[11px]">
              {t("settings.brandPaused")}
            </Badge>
          )}
        </span>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("settings.editBrand")}
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("settings.deleteBrand")}
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>
      </div>
      {brand.is_active === false && (
        <span className="text-xs text-muted-foreground">{t("settings.brandPausedHint")}</span>
      )}
      {brand.domain && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Globe className="h-3 w-3" />
          {brand.domain}
        </span>
      )}
      {brand.competitors && brand.competitors.length > 0 && (
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Tag className="h-3 w-3 shrink-0" />
          {brand.competitors.map((c) => (
            <Badge key={c} variant="outline" className="text-[11px]">
              {c}
            </Badge>
          ))}
        </span>
      )}
    </div>
  );
}
