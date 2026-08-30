"use client";

import { useI18n } from "@/lib/i18n/context";

/**
 * Drop-in translated text node for use inside Server Components, which
 * can't call the useI18n() hook directly. Renders as a plain <span> by
 * default so it doesn't disturb surrounding inline layout; pass `as` for
 * a block element where needed.
 */
export function T({
  k,
  vars,
  as: As = "span",
}: {
  k: string;
  vars?: Record<string, string | number>;
  as?: keyof JSX.IntrinsicElements;
}) {
  const { t } = useI18n();
  return <As>{t(k, vars)}</As>;
}
