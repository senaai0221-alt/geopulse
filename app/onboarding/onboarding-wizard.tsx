"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Target, Globe, Users, MessageCircleQuestion, Loader2, Rocket, Tag } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineAlert } from "@/components/ui/inline-alert";
import { CategoryChipGroup } from "@/components/category-chip-group";
import { AliasSuggestionHint } from "@/components/alias-suggestion-hint";
import { CATEGORY_CHIPS } from "@/lib/category-chips";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { translateActionError } from "@/lib/i18n/action-error";
import { completeOnboarding } from "./actions";

const COMPETITOR_SLOTS = [1, 2, 3] as const;
const PROMPT_SLOTS = [1, 2, 3] as const;

// One distinct example per slot instead of the same placeholder
// repeated three times - a single, industry-specific example ("...best
// baby mobile for a newborn?") read as unrelated to whatever the
// visitor was actually about to track, and gave no sense that the
// three slots are meant to cover different kinds of questions (a
// recommendation search, a reviews/reputation search, a category-wide
// search) rather than three interchangeable blanks (2026-09).
const PROMPT_PLACEHOLDER_KEYS = {
  1: "onboarding.promptPlaceholder1",
  2: "onboarding.promptPlaceholder2",
  3: "onboarding.promptPlaceholder3",
} as const;

// Same idea as PROMPT_PLACEHOLDER_KEYS above, but for a different
// reason: these three slots ARE genuinely interchangeable (just "up to
// 3 rivals"), so one shared placeholder was never actually wrong the
// way the prompt one was - A/B/C just makes that "these are 3 separate
// slots, not 3 copies of the same field" reading unambiguous at a
// glance (2026-09, flagged from a screenshot of all three showing the
// identical "A社の商品").
const COMPETITOR_PLACEHOLDER_KEYS = {
  1: "onboarding.competitorPlaceholder1",
  2: "onboarding.competitorPlaceholder2",
  3: "onboarding.competitorPlaceholder3",
} as const;

/**
 * One-tap question fill (2026-09): keyed by CATEGORY_CHIPS' own plain-
 * Japanese `value` strings (never i18n-keyed at the value level - see
 * that module's own comment for why), not by chip index, so this stays
 * correct even if CATEGORY_CHIPS' order or membership ever changes.
 * Distinct from PROMPT_PLACEHOLDER_KEYS above - those are greyed-out
 * placeholder text (never actually submitted unless typed), these are
 * real strings written into the field on click.
 */
const CATEGORY_FILL_TEXT_KEY: Record<string, string> = {
  "選び方・おすすめ": "onboarding.categoryFillRecommend",
  "評判・口コミ": "onboarding.categoryFillReviews",
  "他社との比較": "onboarding.categoryFillComparison",
  "価格・機能": "onboarding.categoryFillPriceFeatures",
};

const NAME_MAX = 100;
const DOMAIN_MAX = 200;
const ALIASES_MAX = 300;
const COMPETITOR_MAX = 60;
const PROMPT_MAX = 300;

interface PromptDraft {
  text: string;
  category: string;
}

function emptyPrompts(): Record<number, PromptDraft> {
  return { 1: { text: "", category: "" }, 2: { text: "", category: "" }, 3: { text: "", category: "" } };
}

/**
 * The whole wizard as one scrollable page (not a paginated multi-step
 * flow with its own Next/Back navigation) - three clearly-labeled
 * sections, all fillable at once, one submit at the bottom. Only the
 * brand name is actually required; competitors and prompts are
 * genuinely optional (an empty slot is just dropped, never sent as a
 * blank row) so someone in a hurry can finish with one field and add
 * the rest later from the dashboard's own forms.
 */
export function OnboardingWizard() {
  const { t } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [brandName, setBrandName] = useState("");
  const [aliases, setAliases] = useState("");
  const [domain, setDomain] = useState("");
  const [competitors, setCompetitors] = useState<Record<number, string>>({ 1: "", 2: "", 3: "" });
  const [prompts, setPrompts] = useState<Record<number, PromptDraft>>(emptyPrompts());
  // Which question slot (if any) currently has focus - read (not
  // reacted to) only inside fillPromptFromChip below, so a chip click
  // targets whichever field the visitor was just about to type into.
  const [focusedPromptSlot, setFocusedPromptSlot] = useState<(typeof PROMPT_SLOTS)[number] | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  /**
   * One click both fills a real example question (not just a greyed-
   * out placeholder) and tags its category - into whichever slot the
   * visitor was just focused on, or the first empty slot from the top
   * if none was focused. Never throws even with all three slots full
   * and nothing focused: falls back to slot 1, an explicit, harmless
   * overwrite rather than a silent no-op that would look like the tap
   * did nothing.
   */
  function fillPromptFromChip(category: string) {
    const textKey = CATEGORY_FILL_TEXT_KEY[category];
    const text = textKey ? t(textKey) : "";
    setPrompts((prev) => {
      const target =
        focusedPromptSlot ?? PROMPT_SLOTS.find((slot) => !prev[slot].text.trim()) ?? PROMPT_SLOTS[0];
      return { ...prev, [target]: { text, category } };
    });
  }

  const error =
    !errorCode
      ? null
      : errorCode === "validation.required"
      ? t(errorCode)
      : translateActionError(t, errorCode, "onboarding.saveFailed");

  function handleSubmit() {
    setErrorCode(null);
    // Same reasoning as BrandForm/PromptForm's own manual check - native
    // `required` validation bubbles render in the browser's own
    // language, not necessarily the app's current one.
    if (!brandName.trim()) {
      setErrorCode("validation.required");
      return;
    }

    const formData = new FormData();
    formData.set("brand_name", brandName);
    formData.set("aliases", aliases);
    formData.set("domain", domain);
    for (const slot of COMPETITOR_SLOTS) formData.set(`competitor_${slot}`, competitors[slot]);
    for (const slot of PROMPT_SLOTS) {
      formData.set(`prompt_text_${slot}`, prompts[slot].text);
      formData.set(`prompt_category_${slot}`, prompts[slot].category);
    }

    startTransition(async () => {
      const result = await completeOnboarding(formData);
      if (!result.ok) {
        setErrorCode(result.code ?? "");
        return;
      }
      router.push("/dashboard");
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      noValidate
      className="flex flex-col gap-6"
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            {t("onboarding.step1Title")}
          </CardTitle>
          <CardDescription>{t("onboarding.step1Desc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="onboarding-brand-name">{t("onboarding.brandNameLabel")}</Label>
            <Input
              id="onboarding-brand-name"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder={t("settings.brandNamePlaceholder")}
              maxLength={NAME_MAX}
              required
              autoFocus
              className="onboarding-glow ring-2 ring-primary/40"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="onboarding-aliases" className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              {t("onboarding.aliasesLabel")}
            </Label>
            <Input
              id="onboarding-aliases"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder={t("settings.brandAliasesPlaceholder")}
              maxLength={ALIASES_MAX}
            />
            <p className="text-xs text-muted-foreground">{t("settings.brandAliasesHint")}</p>
            <AliasSuggestionHint
              brandName={brandName}
              currentAliases={aliases}
              onAdd={(suggestion) => setAliases((prev) => (prev.trim() ? `${prev}, ${suggestion}` : suggestion))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="onboarding-domain" className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              {t("onboarding.domainLabel")}
            </Label>
            <Input
              id="onboarding-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              maxLength={DOMAIN_MAX}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            {t("onboarding.step2Title")}
          </CardTitle>
          <CardDescription>{t("onboarding.step2Desc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {COMPETITOR_SLOTS.map((slot) => (
            <div key={slot} className="flex flex-col gap-1.5">
              <Label htmlFor={`onboarding-competitor-${slot}`} className="text-xs text-muted-foreground">
                {t("onboarding.competitorLabel", { n: slot })}
              </Label>
              <Input
                id={`onboarding-competitor-${slot}`}
                value={competitors[slot]}
                onChange={(e) => setCompetitors((prev) => ({ ...prev, [slot]: e.target.value }))}
                placeholder={t(COMPETITOR_PLACEHOLDER_KEYS[slot])}
                maxLength={COMPETITOR_MAX}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircleQuestion className="h-4 w-4 text-primary" />
            {t("onboarding.step3Title")}
          </CardTitle>
          <CardDescription>{t("onboarding.step3Desc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {/* One-tap fill (2026-09): a single shared row instead of a
              copy under each slot - it routes to whichever slot makes
              sense (focused, else first empty from the top) rather than
              being tied to one specific field, so it only needs to
              exist once. The per-slot CategoryChipGroup further below
              is unchanged and still there for tagging a question the
              visitor typed themselves without replacing its text. */}
          <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3">
            <p className="text-xs text-muted-foreground">{t("onboarding.categoryFillHint")}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {CATEGORY_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  // Without this, clicking the chip while a prompt
                  // input is focused fires that input's onBlur (mouse-
                  // down moves focus first) BEFORE this button's own
                  // onClick runs - focusedPromptSlot would already be
                  // cleared back to null by the time fillPromptFromChip
                  // reads it, so a click would always fall through to
                  // the "first empty slot" branch and never actually
                  // fill the field the visitor was just typing into.
                  // preventDefault on mousedown keeps the input focused
                  // right through the click (the same technique
                  // toolbar buttons over a focused text field always
                  // need), so onBlur never fires and the state is still
                  // correct when onClick reads it.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => fillPromptFromChip(chip.value)}
                  className={cn(
                    "rounded-full border border-input bg-background px-3 py-1 text-xs font-medium text-muted-foreground",
                    "transition-colors hover:border-primary/50 hover:bg-accent hover:text-foreground"
                  )}
                >
                  {t(chip.labelKey)}
                </button>
              ))}
            </div>
          </div>

          {PROMPT_SLOTS.map((slot) => (
            <div key={slot} className="flex flex-col gap-2">
              <Label htmlFor={`onboarding-prompt-${slot}`} className="text-xs text-muted-foreground">
                {t("onboarding.promptLabel", { n: slot })}
              </Label>
              <Input
                id={`onboarding-prompt-${slot}`}
                value={prompts[slot].text}
                onChange={(e) =>
                  setPrompts((prev) => ({ ...prev, [slot]: { ...prev[slot], text: e.target.value } }))
                }
                onFocus={() => setFocusedPromptSlot(slot)}
                // Only clears if this exact slot is still the recorded
                // one - without that check, tabbing straight from slot
                // 1 into slot 2 fires slot 2's onFocus (sets 2) BEFORE
                // slot 1's onBlur (which would otherwise clear it right
                // back to null a tick later).
                onBlur={() => setFocusedPromptSlot((current) => (current === slot ? null : current))}
                placeholder={t(PROMPT_PLACEHOLDER_KEYS[slot])}
                maxLength={PROMPT_MAX}
              />
              <CategoryChipGroup
                value={prompts[slot].category}
                onChange={(next) => setPrompts((prev) => ({ ...prev, [slot]: { ...prev[slot], category: next } }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {error && <InlineAlert>{error}</InlineAlert>}

      <Button type="submit" size="lg" disabled={isPending} className="gap-2">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
        {isPending ? t("onboarding.submitting") : t("onboarding.submitButton")}
      </Button>

      {/* The button's own "設定を保存し、初回の計測を実行しています…"
          label is easy to miss (small text, easy to scroll past once
          the page hasn't visibly moved in a while) - a real first-time
          user reported exactly this reading as a frozen/broken page
          during the real ~1-2 minute wait while every registered
          prompt's first check runs across all 6 providers (see
          app/onboarding/page.tsx's own maxDuration comment). A full-
          screen overlay that states the expected wait up front removes
          the ambiguity a spinner alone leaves - "is this stuck, or is
          it just slow" - for as long as the wait actually lasts. */}
      {isPending && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="flex max-w-sm flex-col items-center gap-3 rounded-lg bg-card p-6 text-center shadow-xl">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-semibold text-foreground">{t("onboarding.submittingOverlayTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("onboarding.submittingOverlayDesc")}</p>
          </div>
        </div>
      )}
    </form>
  );
}

