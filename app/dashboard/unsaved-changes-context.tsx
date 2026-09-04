"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

interface UnsavedChangesContextValue {
  isDirty: boolean;
  /** Registers/clears one form's dirty state under its own stable id -
   *  a plain single boolean would let one form's "I'm clean now" wipe
   *  out another still-dirty form's warning (settings/page.tsx alone
   *  can have BrandForm's add-new form and any number of BrandListItem
   *  edit forms all mounted at once). See useFormDirtyGuard below for
   *  the per-form-friendly wrapper most call sites actually want. */
  setDirty: (id: string, dirty: boolean) => void;
  /** Shows the native confirm() prompt if anything is dirty; returns
   *  true when it's safe to proceed (nothing was dirty, or the visitor
   *  confirmed discarding it - which this also clears). Used by every
   *  in-app nav Link's onClick (see sidebar-nav.tsx/mobile-nav.tsx/
   *  logo-link.tsx) before letting Next's own Link navigation run. */
  confirmDiscard: () => boolean;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

const CONFIRM_MESSAGE = "入力内容が保存されていません。移動しますか？";

/**
 * App-wide "don't silently lose what I was typing" guard (2026-09,
 * following a real-user UX test that found the settings/integrations/
 * contact forms had zero protection against a stray sidebar click or
 * the browser's own back button - only the header logo was disabled on
 * those pages, which just prevented ONE of several ways to navigate
 * away). Mounted once in dashboard/layout.tsx, above SidebarNav/
 * MobileNav/DashboardLogoLink and every page's own form content, so all
 * of them share one source of truth for "is anything unsaved right
 * now."
 *
 * Covers three distinct ways a visitor can leave a dirty form:
 * 1. An in-app nav Link (sidebar/drawer/logo) - each wraps its onClick
 *    in confirmDiscard(), which is a synchronous window.confirm() Next's
 *    Link respects (calling preventDefault() inside a Link's onClick
 *    stops its own navigation - a supported, documented pattern).
 * 2. A full page unload (tab close, refresh, typing a new URL) - the
 *    beforeunload listener below. Browsers no longer allow a custom
 *    message here (Chrome/Firefox/Safari all show their own generic
 *    text) - `e.returnValue` just needs to be a non-empty/truthy value
 *    to trigger that native prompt at all.
 * 3. The browser's own Back/Forward buttons - these fire `popstate`,
 *    not `beforeunload`, since a same-origin Next.js App Router route
 *    change never actually unloads the page. There's no built-in
 *    "cancel this navigation" API for popstate (unlike the old Pages
 *    Router's router.events, App Router has nothing equivalent yet), so
 *    this uses the standard workaround: immediately push the current
 *    URL back onto the history stack (undoing the back-navigation the
 *    browser already started), ask via confirm(), and if confirmed,
 *    replay the back-navigation for real (now with nothing dirty, so
 *    the second popstate this triggers is a no-op here).
 */
export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  // The source of truth is this ref (checked synchronously from the
  // beforeunload/popstate listeners, which can't wait for a re-render);
  // `isDirty` state exists only so components can reactively style
  // themselves off it (e.g. a future "unsaved changes" badge) without
  // reading the ref during render.
  const dirtySources = useRef<Set<string>>(new Set());
  const [isDirty, setIsDirty] = useState(false);

  // The URL to snap back to if a popstate needs cancelling - NOT read
  // from window.location inside the popstate handler itself, because by
  // the time that event fires the browser has *already* changed
  // window.location to the destination we're trying to block. Written
  // directly in the render body (not an effect) so it's always the most
  // recently *rendered* URL - a plain native `popstate` listener fires
  // synchronously, before React has scheduled/committed the re-render
  // that usePathname()/useSearchParams() would produce for the new
  // location, so this ref is still holding the correct "stay here" URL
  // at the exact moment the handler below needs it - confirmed via a
  // live A/B test (first draft read window.location.href here instead
  // and, despite the confirm() prompt correctly appearing and Cancel
  // correctly being chosen, still left the browser on the destination
  // URL every time).
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUrlRef = useRef("");
  const query = searchParams.toString();
  currentUrlRef.current = query ? `${pathname}?${query}` : pathname;

  const setDirty = useCallback((id: string, dirty: boolean) => {
    if (dirty) dirtySources.current.add(id);
    else dirtySources.current.delete(id);
    setIsDirty(dirtySources.current.size > 0);
  }, []);

  const confirmDiscard = useCallback(() => {
    if (dirtySources.current.size === 0) return true;
    const ok = window.confirm(CONFIRM_MESSAGE);
    if (ok) {
      dirtySources.current.clear();
      setIsDirty(false);
    }
    return ok;
  }, []);

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtySources.current.size === 0) return;
      e.preventDefault();
      e.returnValue = "";
    }

    // See this module's own comment (case 3) for why this can't just
    // call e.preventDefault() the way beforeunload does above -
    // popstate has already happened by the time this fires.
    function handlePopState() {
      if (dirtySources.current.size === 0) return;
      window.history.pushState(null, "", currentUrlRef.current);
      const ok = window.confirm(CONFIRM_MESSAGE);
      if (ok) {
        dirtySources.current.clear();
        setIsDirty(false);
        window.history.back();
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  return (
    <UnsavedChangesContext.Provider value={{ isDirty, setDirty, confirmDiscard }}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges() {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) throw new Error("useUnsavedChanges must be used within UnsavedChangesProvider");
  return ctx;
}

/**
 * Per-form convenience wrapper - a stable id (useId, unique per mounted
 * form instance) plus markDirty/markClean instead of the raw
 * (id, boolean) setDirty signature every call site would otherwise
 * repeat. Also clears this form's own entry on unmount, so a form that
 * disappears without an explicit save/cancel (a brand's edit row
 * removed by deleteBrand, navigating away some other way) can never
 * leave a stale "still dirty" entry behind forever.
 */
export function useFormDirtyGuard() {
  const { setDirty } = useUnsavedChanges();
  const id = useId();

  const markDirty = useCallback(() => setDirty(id, true), [id, setDirty]);
  const markClean = useCallback(() => setDirty(id, false), [id, setDirty]);

  useEffect(() => () => setDirty(id, false), [id, setDirty]);

  return { markDirty, markClean };
}
