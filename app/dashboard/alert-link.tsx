"use client";

/**
 * Turns a "最近のアラート" message into a jump-to-evidence link, rather
 * than a dead-end summary sentence. Handles the click itself instead of
 * a plain <a href="#...">: a native anchor jump always snaps straight
 * to the top of the target, which for a single table cell deep in a
 * tall page reads as "scrolled to... somewhere?" - scrollIntoView with
 * block: "center" actually lands the cell in view, and the temporary
 * `alert-target-flash` class (see app/globals.css) spotlights that one
 * cell specifically (not the whole row) so it's obvious which LLM
 * result the alert was about and that the raw-answer icon right next
 * to it is the next thing worth clicking.
 */
export function AlertLink({
  promptId,
  provider,
  children,
}: {
  /** Null for a brand-level alert (e.g. the AI露出率/AI推奨率 gap
   *  notice, 2026-09) - there's no single ranking-table cell it's
   *  "about", so it renders as plain text below instead of a link. */
  promptId: string | null;
  provider: string | null;
  children: React.ReactNode;
}) {
  if (!promptId || !provider) {
    return <p>{children}</p>;
  }

  const targetId = `result-${promptId}-${provider}`;

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    const el = document.getElementById(targetId);
    if (!el) return; // no JS-handled target (different brand view, etc.) - fall back to the plain anchor jump

    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // Restart the animation even if this exact alert was just clicked a
    // moment ago (re-triggering a CSS animation requires the class to
    // actually toggle off before back on).
    el.classList.remove("alert-target-flash");
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    el.offsetWidth; // force reflow so the removal above registers before re-adding
    el.classList.add("alert-target-flash");
    window.setTimeout(() => el.classList.remove("alert-target-flash"), 2500);
  }

  return (
    <a href={`#${targetId}`} onClick={handleClick} className="block hover:underline">
      {children}
    </a>
  );
}
