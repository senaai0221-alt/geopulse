"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { CATEGORY_CHIPS } from "@/lib/category-chips";

/**
 * A row of tap-to-select "question type" chips - see lib/category-chips
 * for why the value set is fixed rather than free text, and for why
 * this is shared between app/dashboard/prompt-form.tsx and app/
 * onboarding/onboarding-wizard.tsx rather than reimplemented in each.
 * Single-select with click-to-deselect (`value` can go back to "" -
 * the category stays optional, same as the free-text field this
 * replaced).
 */
export function CategoryChipGroup({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {CATEGORY_CHIPS.map((chip) => {
        const selected = value === chip.value;
        return (
          <button
            key={chip.value}
            type="button"
            onClick={() => onChange(selected ? "" : chip.value)}
            aria-pressed={selected}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {t(chip.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
