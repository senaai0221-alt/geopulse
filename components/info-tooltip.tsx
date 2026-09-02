"use client";

import { Info } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n/context";

/**
 * A small (i)-icon that reveals a translated explanation on tap/click.
 * Built on Radix's Popover, not Tooltip (components/ui/tooltip.tsx) -
 * Tooltip is a hover/focus primitive with no real touch-device story:
 * on a phone, tapping it fires Radix's hover-open heuristic and then a
 * near-simultaneous blur-like event closes it again almost instantly,
 * which is exactly the "opens for a flash then vanishes" bug reported
 * from real mobile testing. Popover is click/tap-toggled by design on
 * every input type, so there's no heuristic to fight - one tap opens
 * it, a second tap (or a tap outside) closes it, identically on desktop
 * and mobile. The one tradeoff: a desktop mouse now has to click
 * instead of just hovering - a small, deliberate cost for a control
 * that has to work reliably on a touchscreen first.
 */
export function InfoTooltip({ textKey }: { textKey: string }) {
  const { t } = useI18n();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t(textKey)}
          className="inline-flex cursor-help items-center text-muted-foreground outline-none focus-visible:text-foreground"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent>{t(textKey)}</PopoverContent>
    </Popover>
  );
}
