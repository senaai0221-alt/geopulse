"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import ja from "@/locales/ja.json";
import en from "@/locales/en.json";

export type Locale = "ja" | "en";

const DICTIONARIES: Record<Locale, Record<string, unknown>> = { ja, en };
const STORAGE_KEY = "zonostick-locale";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Looks up a dot-path key (e.g. "dashboard.mentionRate") in the
   *  current locale's dictionary, falling back to Japanese, then to the
   *  key itself if neither has it. `{name}`-style placeholders in the
   *  string are replaced from `vars`. */
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function lookup(dict: Record<string, unknown>, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

/**
 * Lightweight client-side i18n: no routing/locale-prefixed URLs, just a
 * dictionary lookup + a value in localStorage. Server Components render
 * Japanese copy by default (see the `t()` usages that call the plain
 * dictionary directly for server-rendered strings); this provider only
 * covers Client Components, which is where the language toggle and any
 * post-load text swap actually happen.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  // English is the product default (Zonostick targets a global
  // audience first); Japanese is the opt-in/detected case, not the
  // other way around.
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "ja" || stored === "en") {
      setLocaleState(stored);
      return;
    }
    // No explicit preference yet - only switch to Japanese on a clearly
    // Japanese browser locale; everything else stays English.
    const guess = navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
    setLocaleState(guess);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing / storage disabled - the choice just won't
      // persist across reloads, which is fine.
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const text = lookup(DICTIONARIES[locale], key) ?? lookup(DICTIONARIES.ja, key) ?? key;
      return interpolate(text, vars);
    },
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}
