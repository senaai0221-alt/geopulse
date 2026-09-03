/**
 * Regression check for isSafeRedirectPath (lib/utils.ts), added when
 * app/login's own `next` query param was wired through to
 * app/auth/callback's actual post-auth redirect (2026-09 CTA/URL
 * context-preservation work). Before this, `next` was only ever
 * populated by middleware.ts itself (always a same-origin pathname it
 * computed from the current request) - now it's directly editable by
 * anyone via the URL bar or a crafted link
 * ("/login?next=https://evil.example"), so the value has to be
 * validated before it's ever used in a redirect, not just trusted.
 *
 * Run with: npx tsx scripts/verify-login-redirect-safety.ts
 */
import { isSafeRedirectPath } from "../lib/utils";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} - ${label}`);
  if (!ok) {
    console.log(`     expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failures++;
  }
}

check("A plain relative path is safe", isSafeRedirectPath("/pricing"), true);
check("A relative path with a query string is safe", isSafeRedirectPath("/pricing?plan=business"), true);
check("null is not safe (falls back to the default)", isSafeRedirectPath(null), false);
check("undefined is not safe", isSafeRedirectPath(undefined), false);
check("Empty string is not safe", isSafeRedirectPath(""), false);
check(
  "A scheme-relative URL (//evil.example) is NOT safe - browsers resolve it off-site",
  isSafeRedirectPath("//evil.example"),
  false
);
check(
  "A backslash variant (/\\evil.example) is NOT safe - some browsers also resolve this off-site",
  isSafeRedirectPath("/\\evil.example"),
  false
);
check("A full absolute URL is NOT safe", isSafeRedirectPath("https://evil.example"), false);
check(
  "A protocol-relative URL disguised with a leading space is NOT safe",
  isSafeRedirectPath(" //evil.example"),
  false
);
check("A path not starting with / is NOT safe", isSafeRedirectPath("dashboard"), false);

console.log(`\n${failures === 0 ? "All redirect-safety checks passed." : `${failures} check(s) FAILED.`}`);
if (failures > 0) process.exit(1);
