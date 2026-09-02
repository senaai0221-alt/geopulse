"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineAlert } from "@/components/ui/inline-alert";
import { InfoTooltip } from "@/components/info-tooltip";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { translateActionError } from "@/lib/i18n/action-error";
import { createPrompt } from "./actions";
import { PlanLimitAlert } from "./plan-limit-alert";

// Server-side (createPrompt in actions.ts) truncates to the same caps
// regardless - see BrandForm for why these exist too.
const TEXT_MAX = 300;

// Fixed choices, not free text - a beginner staring at a blank
// "カテゴリ・タグ" text box had no idea what to type (or why they'd
// bother); four concrete, one-tap question types both lower that
// barrier and double as a hint about what this whole feature is for
// ("選択するとAIの得意・非得意が分かります" - see the label below).
// Deliberately plain Japanese strings, not routed through the i18n
// dictionary at the VALUE level (only the chip's displayed label is
// translated) - `category` has never been a translated UI string
// anywhere else in this app, just free text the creator typed, and a
// chip's value is exactly the same kind of user data, only tap-entered
// instead of typed. Two people (or the same person switching the EN/JA
// toggle) clicking "different-language" chips already wouldn't group
// together under the old free-text system either.
const CATEGORY_CHIPS: { value: string; labelKey: string }[] = [
  { value: "選び方・おすすめ", labelKey: "dashboard.categoryChipRecommend" },
  { value: "評判・口コミ", labelKey: "dashboard.categoryChipReviews" },
  { value: "他社との比較", labelKey: "dashboard.categoryChipComparison" },
  { value: "価格・機能", labelKey: "dashboard.categoryChipPriceFeatures" },
];

export function PromptForm({
  brandId,
  businessPriceId,
  highlight = false,
}: {
  brandId: string;
  businessPriceId: string;
  /** True while the account has zero prompts - draws a pulsing blue
   *  ring around the text field so a first-time user's eye lands on
   *  exactly the control the onboarding guide just told them to use.
   *  Stops rendering itself the moment a prompt exists (see
   *  dashboard/page.tsx), so there's no need to dismiss it manually. */
  highlight?: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  // The chip group's selection - a hidden input (not a native radio
  // group's own value) carries it into FormData, since the chips
  // themselves are plain buttons, not form controls of their own.
  const [category, setCategory] = useState("");
  // Stored as a code and translated at render time (see `error` below) -
  // see BrandForm for why.
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const errorType = errorCode?.split(":")[0];
  const isPlanLimitError = errorType === "no_free_tier" || errorType === "prompt_limit";
  const error =
    !errorCode || isPlanLimitError
      ? null
      : errorCode === "validation.required"
      ? t(errorCode)
      : translateActionError(t, errorCode, "dashboard.addPromptFailed");

  function handleSubmit(formData: FormData) {
    setErrorCode(null);
    // See BrandForm's handleSubmit for why this manual check (rather than
    // the browser's native `required` validation) is what actually runs.
    if (!String(formData.get("text") ?? "").trim()) {
      setErrorCode("validation.required");
      return;
    }
    startTransition(async () => {
      try {
        const newPrompt = await createPrompt(formData);
        formRef.current?.reset();
        // The chip selection lives in React state, not a native form
        // field - formRef.current.reset() above only clears the
        // uncontrolled text input, not this.
        setCategory("");

        // Kick off one immediate measurement for the new prompt so it
        // shows real data right away instead of an empty row until
        // tomorrow's cron. Fire-and-forget: if it fails, tomorrow's
        // cron still covers it normally, so it must not block the form.
        fetch("/api/prompts/check-now", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ promptId: newPrompt.id }),
        })
          .catch(() => {})
          .finally(() => router.refresh());
      } catch (err) {
        setErrorCode(err instanceof Error ? err.message : "");
      }
    });
  }

  return (
    // The error/plan-limit alert used to render as a direct sibling of
    // the text/category/button controls inside the same sm:flex-row -
    // InlineAlert has no width cap, so once an error appeared it fought
    // the text input for space in that one row and could squeeze it
    // down to nothing (reported as the prompt field "disappearing").
    // Splitting the controls into their own row and letting the alert
    // render as a full-width block below it means the two can never
    // compete for the same horizontal space.
    <form ref={formRef} action={handleSubmit} noValidate className="flex flex-col gap-3">
      <input type="hidden" name="brand_id" value={brandId} />
      <input type="hidden" name="category" value={category} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          name="text"
          placeholder={t("dashboard.promptPlaceholder")}
          maxLength={TEXT_MAX}
          required
          // min-w-0 overrides the flex default (min-width: auto), which
          // otherwise refuses to let a flex-1 item shrink below its own
          // content size - without it, this input could get pushed
          // past the row's available width instead of shrinking to fit.
          className={cn("min-w-0 flex-1", highlight && "onboarding-glow ring-2 ring-primary/40")}
        />
        {/* Outline, not filled, once the plan limit has actually been
            hit - same reasoning as brand-form.tsx's submit button: it
            shouldn't carry the same visual weight as the
            PlanLimitAlert's upgrade button sitting right below it when
            only upgrading can actually succeed right now. */}
        <Button
          type="submit"
          disabled={isPending}
          variant={isPlanLimitError ? "outline" : "default"}
          size="sm"
          className="shrink-0"
        >
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          {t("dashboard.addPromptButton")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          {t("dashboard.categoryQuestionTypeLabel")}
          <InfoTooltip textKey="dashboard.categoryFieldTooltip" />
        </span>
        {CATEGORY_CHIPS.map((chip) => {
          const selected = category === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              // Click again to deselect (back to no category, same
              // optional-by-default behavior the old free-text field
              // had) rather than being forced to always pick exactly
              // one of the four.
              onClick={() => setCategory(selected ? "" : chip.value)}
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

      {isPlanLimitError && errorCode ? (
        <PlanLimitAlert code={errorCode} businessPriceId={businessPriceId} />
      ) : (
        error && <InlineAlert>{error}</InlineAlert>
      )}
    </form>
  );
}
