import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { formatJstIntl } from "./jst";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * True for a `next`/post-auth redirect target that's safe to send a
 * browser to without ever leaving this site - a plain same-origin path
 * like "/pricing?plan=pro", never a scheme-relative or absolute URL.
 *
 * Used both where a `next` value is first accepted from a query param
 * (app/login) and, more importantly, where it's actually turned into a
 * redirect (app/auth/callback) - `next` was previously only ever
 * populated by this app's own middleware (always a same-origin
 * pathname), so this check was never exercised; wiring the login
 * page's own `next` query param through to the same redirect made it,
 * for the first time, directly attacker-editable (a crafted link like
 * `/login?next=https://evil.example`), so both ends now reject
 * anything that isn't unambiguously a same-origin path rather than
 * relying on string concatenation to happen to stay harmless.
 */
export function isSafeRedirectPath(next: string | null | undefined): next is string {
  // "/" (a real relative path) but not "//" or "/\" (browsers resolve
  // both as scheme-relative, i.e. off-site) - and not something like
  // "/\t/evil.com" that tabs/newlines could otherwise smuggle past a
  // naive check.
  return !!next && /^\/(?!\/|\\)/.test(next.trim());
}

// Pinned to JST (see lib/jst.ts's own comment) - this used to call
// Intl.DateTimeFormat with no `timeZone`, which reads the SERVER
// process's own local time (UTC on Vercel, not JST), so every alert
// timestamp shown on the dashboard (app/dashboard/page.tsx's "最近の
// アラート" card - the only caller) rendered up to 9 hours/a full
// calendar day off from when the check actually ran in Japan.
export function formatDate(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatJstIntl(d, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
