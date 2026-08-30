"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/context";

/**
 * Nested error boundary for everything under /dashboard. Without this,
 * a crash in any dashboard page (settings, report, help, or the
 * dashboard itself) fell through to the root app/error.tsx, which
 * replaces the *entire* app body - the sidebar and header from
 * app/dashboard/layout.tsx disappeared along with it, leaving no way
 * back to the rest of the app except a manual URL edit. error.js
 * boundaries don't catch errors from their own segment's layout.js, so
 * this one only fires for page-level failures - exactly the case where
 * keeping the surrounding chrome mounted actually matters.
 */
export default function DashboardErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    console.error("Unhandled render error in /dashboard:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <AlertTriangle className="mb-2 h-9 w-9 text-amber-500" />
          <CardTitle>{t("error.title")}</CardTitle>
          <CardDescription>{t("error.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button onClick={() => reset()} size="sm">
            <RotateCw className="mr-2 h-4 w-4" />
            {t("error.reload")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
