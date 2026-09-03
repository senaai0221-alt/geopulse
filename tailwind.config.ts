import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    // `.container` (used by the dashboard/report header + main-content
    // row - see app/dashboard/layout.tsx) is fluid (100% width, just
    // centered + padded) below the '2xl' breakpoint either way; only
    // the max-width AT 2xl and up matters here. 1280px left a wide,
    // increasingly common desktop monitor (>=1536px, where '2xl'
    // actually kicks in) with several hundred px of dead margin on
    // each side while tables/charts stayed cramped - 1600px keeps a
    // hard ceiling (unbounded content on an ultrawide would just be
    // hard to read) but uses far more of a normal wide monitor.
    container: {
      center: true,
      padding: "1.5rem",
      screens: {
        "2xl": "1600px",
      },
    },
    extend: {
      fontFamily: {
        // See DESIGN.md §3.2: a single system-font stack across every
        // screen (product UI strategy, not a corporate-site webfont) -
        // Zonostick is authenticated-only with no free tier, so most
        // real usage time is inside the dashboard, not the marketing
        // page, and this avoids a webfont network request/FOUC on the
        // screen people actually live in. Tailwind's own default `sans`
        // stack has no CJK fallback at all, which is why Japanese text
        // (this is a bilingual, ja-auto-detecting product - see
        // lib/i18n/context.tsx) rendered in whatever font a given
        // browser/OS happened to fall back to.
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Helvetica Neue",
          "Arial",
          "Hiragino Kaku Gothic ProN",
          "Hiragino Sans",
          "Yu Gothic",
          "Meiryo",
          "sans-serif",
        ],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
