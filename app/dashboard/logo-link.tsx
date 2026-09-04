"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";

import { useUnsavedChanges } from "./unsaved-changes-context";

/**
 * The dashboard header's logo. Used to just disable itself entirely
 * (render as plain text, no navigation) on /dashboard/settings, since
 * that page held unsaved forms a stray click would silently discard -
 * replaced (2026-09, following a real-user UX test) by the same
 * confirmDiscard() guard every other in-app nav link now uses: still
 * protects the same unsaved input, but as a real, working link with a
 * confirm prompt instead of going dead on every form-bearing page
 * (which a first-time visitor has no way to tell apart from a bug).
 */
export function DashboardLogoLink() {
  const { confirmDiscard } = useUnsavedChanges();

  return (
    <Link
      href="/dashboard"
      onClick={(e) => {
        if (!confirmDiscard()) e.preventDefault();
      }}
      className="flex shrink-0 items-center gap-2 font-bold text-lg"
    >
      <Sparkles className="h-5 w-5 text-primary" />
      Zonostick
    </Link>
  );
}
