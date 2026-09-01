"use client";

import { UpgradeButton } from "./upgrade-button";
import { useI18n } from "@/lib/i18n/context";

/**
 * Thin wrapper around UpgradeButton for Server Component callers that
 * only have a translation *key*, not the resolved string - UpgradeButton
 * itself stays key-agnostic so it can also be used with an
 * already-resolved label (see upgrade-button.tsx's own UpgradePrompt).
 */
export function UpgradeButtonLabel({
  priceId,
  labelKey,
  labelVars,
  size = "lg",
  className = "w-full",
}: {
  priceId: string;
  labelKey: string;
  labelVars?: Record<string, string | number>;
  size?: "sm" | "lg";
  className?: string;
}) {
  const { t } = useI18n();
  return <UpgradeButton priceId={priceId} label={t(labelKey, labelVars)} size={size} className={className} />;
}
