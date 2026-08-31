"use client";

import type { LlmProvider } from "@/lib/geo-engine";
import { nameRegex } from "@/lib/geo-engine";
import { useI18n } from "@/lib/i18n/context";

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
  gemini: "Gemini",
  grok: "Grok",
  deepseek: "DeepSeek",
};

/** Splits `text` into plain/highlighted segments wherever `brandName`
 *  actually occurs - reusing geo-engine's own exact-match matcher (see
 *  its nameRegex) rather than a second, potentially-diverging
 *  highlighting rule, so what's visually highlighted here is guaranteed
 *  to be the same text that made this response count as a mention in
 *  the first place. */
function highlightBrandMentions(text: string, brandName: string): (string | { match: string })[] {
  if (!brandName.trim()) return [text];
  const regex = nameRegex(brandName, "gi");
  const segments: (string | { match: string })[] = [];
  let lastIndex = 0;
  for (const m of text.matchAll(regex)) {
    const index = m.index ?? 0;
    if (index > lastIndex) segments.push(text.slice(lastIndex, index));
    segments.push({ match: m[0] });
    lastIndex = index + m[0].length;
  }
  if (lastIndex < text.length) segments.push(text.slice(lastIndex));
  return segments.length > 0 ? segments : [text];
}

/**
 * The report's "real recommendation evidence" quote - the actual raw
 * LLM text that earned the brand a mention this month, with its own
 * name highlighted inline (so a skimming exec doesn't have to hunt for
 * it in a paragraph) and a one-line badge explaining, in plain terms,
 * why this particular response is worth including.
 */
export function EvidenceSnippet({
  text,
  brandName,
  provider,
  rank,
  category,
}: {
  text: string;
  brandName: string;
  provider: LlmProvider;
  rank: number | null;
  /** The prompt's category/cohort, if it has one - prefixed onto the
   *  badge when present since "in the {category} category" is exactly
   *  the kind of context that makes a snippet self-explanatory without
   *  the reader having to go find the original prompt. */
  category: string | null;
}) {
  const { t } = useI18n();
  const segments = highlightBrandMentions(text, brandName);

  const badgeCore =
    rank !== null
      ? t("report.snippetBadgeRanked", { rank, provider: PROVIDER_LABELS[provider] })
      : t("report.snippetBadgeMentioned", { provider: PROVIDER_LABELS[provider] });
  const badge = category ? `${category} · ${badgeCore}` : badgeCore;

  return (
    <div className="rounded-md border border-border bg-muted/30 p-4 print:border-slate-300 print:bg-slate-50">
      <span className="inline-block rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary print:bg-transparent print:px-0 print:py-0 print:text-slate-700">
        {badge}
      </span>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
        {segments.map((seg, i) =>
          typeof seg === "string" ? (
            <span key={i}>{seg}</span>
          ) : (
            <mark
              key={i}
              className="rounded-sm bg-amber-200/80 px-0.5 font-semibold text-slate-900 print:bg-amber-200"
            >
              {seg.match}
            </mark>
          )
        )}
      </p>
    </div>
  );
}
