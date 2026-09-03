import { Suspense } from "react";

import { LoginForm } from "./login-form";

// LoginForm reads `mode`/`next` via useSearchParams(), which requires a
// Suspense boundary around it or `next build` fails this (otherwise
// staticaly-renderable) page with "useSearchParams() should be wrapped
// in a suspense boundary". The fallback only ever flashes for the
// instant it takes React to resolve searchParams client-side - not a
// real loading state - so it's kept visually inert (same page
// background, no spinner) rather than a placeholder that would itself
// flash and disappear.
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-app bg-gradient-to-b from-primary/[0.06] via-background to-muted/40" />}>
      <LoginForm />
    </Suspense>
  );
}
