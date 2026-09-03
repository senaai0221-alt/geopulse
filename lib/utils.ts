import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { formatJstIntl } from "./jst";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
