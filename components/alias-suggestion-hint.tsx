"use client";

import { Lightbulb } from "lucide-react";

import { katakanaToHepburn } from "@/lib/romaji";
import { useI18n } from "@/lib/i18n/context";

/**
 * Proactively suggests a brand's mechanically-derived romaji spelling
 * as an alias, instead of requiring the operator to already know an
 * LLM might render "ドコモ" as "docomo" and think to type that in
 * themselves - see lib/romaji.ts's own comment for the 2026-09
 * incident this generalizes. Renders nothing if the brand name isn't
 * (mostly) katakana, or the suggested spelling is already present in
 * the current aliases text.
 *
 * Deliberately a suggestion the operator clicks to accept, never an
 * auto-filled value they'd have to notice and remove - the mechanical
 * romanization is a best-effort guess (real corporate spellings often
 * diverge from strict Hepburn, e.g. this same "ドコモ" mechanically
 * romanizes to "dokomo", one letter off from the real "docomo"), so
 * silently writing it into their data without a deliberate click would
 * be presumptuous.
 */
export function AliasSuggestionHint({
  brandName,
  currentAliases,
  onAdd,
}: {
  brandName: string;
  /** Raw comma-separated aliases text currently in the field - checked
   *  so an already-added suggestion stops showing itself. */
  currentAliases: string;
  onAdd: (suggestion: string) => void;
}) {
  const { t } = useI18n();

  const suggestion = katakanaToHepburn(brandName.trim());
  if (!suggestion || suggestion.length < 2) return null;
  if (suggestion.toLowerCase() === brandName.trim().toLowerCase()) return null;

  const already = currentAliases
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .includes(suggestion.toLowerCase());
  if (already) return null;

  return (
    <button
      type="button"
      onClick={() => onAdd(suggestion)}
      className="flex items-center gap-1.5 self-start rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-left text-xs text-primary transition-colors hover:bg-primary/10"
    >
      <Lightbulb className="h-3.5 w-3.5 shrink-0" />
      {t("settings.aliasSuggestion", { suggestion })}
    </button>
  );
}
