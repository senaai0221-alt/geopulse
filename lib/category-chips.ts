/**
 * Fixed "question type" choices offered wherever a prompt's category is
 * set by tapping a chip instead of typing free text - app/dashboard/
 * prompt-form.tsx (adding a prompt from the dashboard) and app/
 * onboarding/onboarding-wizard.tsx (the first-run setup wizard) both
 * use this same list, so the two never drift out of sync.
 *
 * Deliberately plain Japanese strings for `value`, not routed through
 * the i18n dictionary at the value level (only each chip's displayed
 * label is, via `labelKey`) - `category` has never been a translated UI
 * string anywhere else in this app, just free text the creator typed,
 * and a chip's value is exactly the same kind of user data, only
 * tap-entered instead of typed.
 */
export const CATEGORY_CHIPS: { value: string; labelKey: string }[] = [
  { value: "選び方・おすすめ", labelKey: "dashboard.categoryChipRecommend" },
  { value: "評判・口コミ", labelKey: "dashboard.categoryChipReviews" },
  { value: "他社との比較", labelKey: "dashboard.categoryChipComparison" },
  { value: "価格・機能", labelKey: "dashboard.categoryChipPriceFeatures" },
];
