# CLAUDE.md — Zonostick

Project-specific instructions for Claude Code. See also [PROJECT_STATUS.md](PROJECT_STATUS.md)
for feature/status history and [DESIGN.md](DESIGN.md) for the UI design system.

## Design system

Any UI work (new component, restyle, new page) must follow [DESIGN.md](DESIGN.md) -
color tokens, the single system-font stack (§3.2, no webfonts), spacing/radius
scale, and the Do's/Don'ts list. DESIGN.md is extracted from the actual
implementation (`app/globals.css`, `tailwind.config.ts`, `components/ui/*`), not
aspirational - when code and DESIGN.md disagree, treat that as a bug in whichever
one is stale and fix it, rather than picking one silently.

## CTA destinations must carry their own context

A link/button whose destination could vary by what was actually clicked - which
plan, login vs. signup framing, where to return to after an intermediate step
(auth, checkout) - must encode that context in the destination URL via query
params, and the destination page must read and act on it. It must never rely on
a shared generic page to guess, and never silently drop context by sending
everything to the same bare URL.

This was a real incident (2026-09): the marketing page's header "ログイン" and
"今すぐ始める", plus every pricing card's own CTA, all pointed at the exact same
bare `/login` regardless of why the visitor clicked - a returning visitor who
picked a specific plan had to re-find it after logging in, and "ログイン" reading
identically to "今すぐ始める" read as the app not knowing what the visitor wanted.
Fixed by wiring `mode`/`next` query params all the way from the marketing page's
CTAs through `/login` and into the actual auth redirect
(`app/auth/callback/route.ts`), and `/pricing?plan=` to highlight the
previously-picked plan. See that commit and `lib/utils.ts`'s `isSafeRedirectPath`
(any such `next`-style param becomes attacker-editable input the moment a page
reads it from the URL - validate it's a same-origin relative path before it's
ever used in a redirect, not just middleware-computed values).
