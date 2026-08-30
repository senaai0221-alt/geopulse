"use client";

import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

/** A minimal EN/JA pill switch, shown in the header on every page. */
export function LangToggle() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t("langToggle.label")}
      className="inline-flex items-center rounded-full border border-border bg-muted/40 p-0.5 text-xs font-medium"
    >
      {(["ja", "en"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          aria-pressed={locale === code}
          className={cn(
            "rounded-full px-2.5 py-1 transition-colors",
            locale === code
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {code === "ja" ? "JA" : "EN"}
        </button>
      ))}
    </div>
  );
}
