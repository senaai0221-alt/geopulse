"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, side = "top", align = "center", sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    side={side}
    align={align}
    sideOffset={sideOffset}
    // collision-aware (Radix/Floating UI flips/shifts to stay on
    // screen - no manual edge-case positioning needed) + a hard
    // max-width so a long explanation never overlaps a neighboring
    // card; z-50 matches the app's other overlays (modals) so a
    // tooltip always layers above ordinary card content.
    //
    // Solid dark bg (not the light bg-popover token) rather than a
    // faint-bordered light card: a near-white tooltip on a near-white
    // page reads as a second, misaligned card outline doubled up
    // against whatever's underneath it (a nav bar, another card's
    // border) instead of clearly floating above it.
    className={cn(
      "z-50 max-w-xs rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs leading-relaxed text-slate-50 shadow-xl animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
      className
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
