"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineAlert } from "@/components/ui/inline-alert";
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
}: {
  brandId: string;
  businessPriceId: string;
  /** Categories already in use on this brand's other prompts, offered
   *  as autocomplete suggestions (native <datalist>) - reusing "比較系"
   *  instead of retyping a near-duplicate like "比較" is what actually
   *  keeps a large prompt set tidy at scale. */
  existingCategories: string[];
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
    <form ref={formRef} action={handleSubmit} noValidate className="flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="brand_id" value={brandId} />
      <Input
        name="text"
        placeholder={t("dashboard.promptPlaceholder")}
        maxLength={TEXT_MAX}
        required
        className="flex-1"
      />
      <Input
        name="category"
        list="prompt-category-suggestions"
        placeholder={t("dashboard.promptCategoryPlaceholder")}
        maxLength={CATEGORY_MAX}
        // min-w rather than a rigid w-48 (192px) - the JA placeholder
        // ("カテゴリ・タグ(任意: 例: 比較系, 認知系)") needs closer to
        // 250-300px to render without the browser silently clipping it.
        className="sm:min-w-[16rem]"
      />
      <datalist id="prompt-category-suggestions">
        {existingCategories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {isPlanLimitError && errorCode ? (
        <PlanLimitAlert code={errorCode} businessPriceId={businessPriceId} />
      ) : (
        error && <InlineAlert>{error}</InlineAlert>
      )}
      <Button type="submit" disabled={isPending} size="sm">
        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
        {t("dashboard.addPromptButton")}
      </Button>
    </form>
  );
}
