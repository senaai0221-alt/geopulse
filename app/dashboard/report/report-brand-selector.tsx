"use client";

import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";

import { Select } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n/context";

/**
 * Replaces the report's old static "{brand} · Open A4 report" line -
 * useful as a link *into* the report from elsewhere, but dead weight
 * once you're already looking at it, and gave no way to switch brands
 * without going back to the dashboard first. Same pattern as
 * month-selector.tsx: a plain <select>, `month` carried along so
 * switching brands doesn't also reset which month is showing.
 */
export function ReportBrandSelector({
  brands,
  selectedBrandId,
  month,
}: {
  brands: { id: string; name: string }[];
  selectedBrandId: string;
  month: string;
}) {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <div className="flex items-center gap-1.5">
      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Select
        aria-label={t("report.brandSelectorLabel")}
        value={selectedBrandId}
        onChange={(e) => router.push(`/dashboard/report?brand=${e.target.value}&month=${month}`)}
        className="h-9 w-auto min-w-[10rem] max-w-[14rem]"
      >
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
