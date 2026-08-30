"use client";

import { Info } from "lucide-react";

import { useI18n } from "@/lib/i18n/context";

/** A small (i)-icon that reveals a translated explanation on hover or
 *  keyboard focus - pure CSS (group-hover/group-focus-within), no
 *  portal/positioning library needed for a fixed-size KPI-card tooltip
 *  like this. */
export function InfoTooltip({ textKey }: { textKey: string }) {
  const { t } = useI18n();
  return (
    <span className="group relative inline-flex">
      <Info
        tabIndex={0}
        aria-label={t(textKey)}
        className="h-3.5 w-3.5 cursor-help text-muted-foreground outline-none focus-visible:text-foreground"
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 rounded-md border border-border bg-popover p-2.5 text-xs font-normal leading-relaxed text-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {t(textKey)}
      </span>
    </span>
  );
}
