"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";

/** Opens the browser's native print dialog - the reliable, dependency-
 *  free way to let a user "save as PDF" without running a headless
 *  browser/PDF library server-side just for this. */
export function PrintButton() {
  const { t } = useI18n();
  return (
    <Button onClick={() => window.print()} size="sm" className="print:hidden">
      <Printer className="mr-2 h-4 w-4" />
      {t("report.print")}
    </Button>
  );
}
