"use client";

import { useState, useTransition } from "react";
import { Tag, Loader2, Check, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/context";
import { updatePromptCategory } from "./actions";

/**
 * Inline "move to group" control for one prompt row - previously a
 * prompt's group/category could only be set once, at creation, in
 * PromptForm; there was no way to rename or re-group an existing one.
 * Saving calls the same revalidatePath-backed server action pattern
 * used everywhere else in this file (see BrandListItem), so the group
 * heading and table above re-render with the change immediately - no
 * page reload, no manual router.refresh(). No modal - editing happens
 * inline in the table row, so sorting a large prompt set into
 * categories is a series of one-click edits, not a series of dialogs.
 */
export function EditPromptGroupButton({
  promptId,
  currentCategory,
  existingCategories,
}: {
  promptId: string;
  currentCategory: string | null;
  /** Categories already used elsewhere on this brand, offered as
   *  autocomplete suggestions - see PromptForm for why. */
  existingCategories: string[];
}) {
  const { t } = useI18n();
  const datalistId = `category-suggestions-${promptId}`;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentCategory ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("prompt_id", promptId);
      formData.set("category", value);
      await updatePromptCategory(formData);
      setEditing(false);
    });
  }

  function handleCancel() {
    setValue(currentCategory ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          list={datalistId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSave();
            } else if (e.key === "Escape") {
              handleCancel();
            }
          }}
          placeholder={t("dashboard.promptCategoryPlaceholder")}
          maxLength={50}
          className="h-7 w-40 text-xs"
        />
        <datalist id={datalistId}>
          {existingCategories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleSave}
          disabled={isPending}
          aria-label={t("settings.saveBrand")}
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleCancel}
          disabled={isPending}
          aria-label={t("settings.cancel")}
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={t("dashboard.editPromptGroup")}
      title={currentCategory ? `${t("dashboard.editPromptGroup")}: ${currentCategory}` : t("dashboard.editPromptGroup")}
      onClick={() => setEditing(true)}
    >
      <Tag className={cn("h-4 w-4", currentCategory ? "text-primary" : "text-muted-foreground")} />
    </Button>
  );
}
