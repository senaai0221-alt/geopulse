"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

/**
 * White-label report header logo. A Server Component can't attach an
 * onError handler (event handlers aren't serializable across the RSC
 * boundary), so this tiny client wrapper exists solely to fall back to
 * the standard Zonostick mark if the operator's custom logo URL is
 * broken/unreachable, rather than showing a broken-image icon on a
 * report someone's about to hand a client.
 */
export function ReportLogo({ logoUrl, companyName }: { logoUrl: string | null; companyName: string | null }) {
  const [broken, setBroken] = useState(false);

  if (logoUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={companyName ?? "Logo"}
        onError={() => setBroken(true)}
        className="h-8 max-w-[180px] object-contain object-left"
      />
    );
  }

  return (
    <div className="flex items-center gap-2 text-lg font-bold">
      <Sparkles className="h-5 w-5 text-primary" />
      {companyName || "Zonostick"}
    </div>
  );
}
