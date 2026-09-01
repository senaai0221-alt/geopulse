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
const CATEGORY_MAX = 50;

export function PromptForm({
  brandId,
  businessPriceId,
  existingCategories,
  highlight = false,
}: {
  brandId: string;
  businessPriceId: string;
  /** Categories already in use on this brand's other prompts, offered
   *  as autocomplete suggestions (native <datalist>) - reusing "比較系"
   *  instead of retyping a near-duplicate like "比較" is what actually
   *  keeps a large prompt set tidy at scale. */
  existingCategories: string[];
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
    <form ref={formRef} action={handleSubmit} noValidate className="flex flex-col gap-2">
      <input type="hidden" name="brand_id" value={brandId} />
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
        <div className="flex shrink-0 items-center gap-1.5">
          <Input
            name="category"
            list="prompt-category-suggestions"
            placeholder={t("dashboard.promptCategoryPlaceholder")}
            maxLength={CATEGORY_MAX}
            className="w-full shrink-0 sm:w-52"
          />
          <InfoTooltip textKey="dashboard.categoryFieldTooltip" />
        </div>
        <datalist id="prompt-category-suggestions">
          {existingCategories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
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
      {isPlanLimitError && errorCode ? (
        <PlanLimitAlert code={errorCode} businessPriceId={businessPriceId} />
      ) : (
        error && <InlineAlert>{error}</InlineAlert>
      )}
    </form>
  );
}
