"use client";

import { useRef, useState, useTransition } from "react";
import { Globe, Tag, Pencil, Trash2, Loader2 } from "lucide-react";

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
}

/** One row in the brand-management list: view mode by default, an
 *  inline edit form for renaming/updating domain & competitors, and a
 *  delete action - none of which existed before (only adding a brand
 *  was possible). */
export function BrandListItem({ brand }: { brand: Brand }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSave(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await updateBrand(formData);
        setEditing(false);
      } catch (err) {
        setError(translateActionError(t, err instanceof Error ? err.message : "", "settings.addBrandFailed"));
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
        className="flex flex-col gap-3 rounded-md border border-primary/40 bg-primary/5 p-3"
      >
        <input type="hidden" name="brand_id" value={brand.id} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`name-${brand.id}`}>{t("settings.brandName")}</Label>
          <Input id={`name-${brand.id}`} name="name" defaultValue={brand.name} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`domain-${brand.id}`}>{t("settings.brandDomain")}</Label>
          <Input id={`domain-${brand.id}`} name="domain" defaultValue={brand.domain ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`competitors-${brand.id}`}>{t("settings.brandCompetitors")}</Label>
          <Input
            id={`competitors-${brand.id}`}
            name="competitors"
            defaultValue={(brand.competitors ?? []).join(", ")}
          />
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
        <span className="font-medium">{brand.name}</span>
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
