"use client";

import { Info } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n/context";

/** A small (i)-icon that reveals a translated explanation on hover or
 *  keyboard focus. Built on Radix's Tooltip primitive (see
 *  components/ui/tooltip.tsx) rather than the browser's native `title`
 *  attribute or fixed absolute positioning - Radix/Floating UI keeps the
 *  bubble on-screen and clear of neighboring cards on its own (flips
 *  side, shifts along the axis) instead of it just running past the
 *  viewport edge on a narrow KPI card. */
export function InfoTooltip({ textKey }: { textKey: string }) {
  const { t } = useI18n();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info
          tabIndex={0}
          aria-label={t(textKey)}
          className="h-3.5 w-3.5 cursor-help text-muted-foreground outline-none focus-visible:text-foreground"
        />
      </TooltipTrigger>
      <TooltipContent>{t(textKey)}</TooltipContent>
    </Tooltip>
  );
}
