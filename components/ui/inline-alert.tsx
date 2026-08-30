import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A small alert card for surfacing a form/action error inline - used in
 * place of a bare destructive-colored <p>, so a failed request reads as
 * a deliberate, designed message rather than an exposed error string.
 */
export function InlineAlert({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive",
        className
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
