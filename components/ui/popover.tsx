"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 6, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        // Same visual language as components/ui/tooltip.tsx's
        // TooltipContent (dark bubble, same size/shadow/animation) - a
        // reader shouldn't be able to tell these two are built on
        // different Radix primitives underneath, only that this one is
        // tap/click-toggled rather than hover-only. See info-tooltip.tsx
        // for why: Radix's Tooltip has no real touch-device story (a tap
        // fires its hover-open heuristic and then a near-simultaneous
        // blur-like event closes it again immediately), while Popover is
        // click/tap-driven by design on every input type.
        "z-50 max-w-xs rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs leading-relaxed text-slate-50 shadow-xl outline-none animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };
