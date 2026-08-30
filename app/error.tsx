"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/context";

/**
 * Next.js App Router error boundary: catches any rendering/data error
 * thrown by a Server or Client Component below this point in the tree
 * and shows this instead of Next's raw "An error occurred in the
 * Server Components render..." page. Applies everywhere except the
 * root layout itself (see app/global-error.tsx for that last resort).
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    console.error("Unhandled render error:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
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
    </main>
  );
}
