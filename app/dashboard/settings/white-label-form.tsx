"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, ImagePlus, Building2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/context";
import { useFormDirtyGuard } from "../unsaved-changes-context";
import { updateWhiteLabelSettings } from "../actions";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];
const MAX_FILE_MB = 2;

/** Business-plan-only: the logo and company name shown on the printed/
 *  PDF report instead of Zonostick's own - lets an agency hand a client
 *  a report that reads as theirs. Both fields are optional; leaving
 *  either blank falls back to Zonostick branding on that piece (see
 *  report/page.tsx).
 *
 *  The logo goes straight from this browser to Supabase Storage (the
 *  `report-logos` bucket - see supabase/schema.sql) using the same
 *  session cookie every other Supabase call here already relies on, so
 *  RLS enforces on its own that a user can only ever write to their own
 *  `<uid>/logo.<ext>` path - no server route needs to touch the file
 *  bytes at all. Once the upload settles, the resulting public URL is
 *  persisted the same way the old plain URL field used to be (see
 *  updateWhiteLabelSettings), so report/page.tsx needs no changes. */
export function WhiteLabelForm({
  initialLogoUrl,
  initialCompanyName,
}: {
  initialLogoUrl: string | null;
  initialCompanyName: string | null;
}) {
  const { t } = useI18n();
  const { markDirty, markClean } = useFormDirtyGuard();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleCompanySubmit(formData: FormData) {
    setSaved(false);
    startTransition(async () => {
      await updateWhiteLabelSettings(formData);
      setSaved(true);
      markClean();
    });
  }

  async function handleFile(file: File) {
    setUploadError(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadError(t("settings.whiteLabelLogoInvalidType"));
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setUploadError(t("settings.whiteLabelLogoTooLarge", { max: MAX_FILE_MB }));
      return;
    }

    setIsUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("not_authenticated");

      // Same filename every time (upsert) - a fixed, known path per
      // user rather than one that accumulates a new object per upload,
      // so there's nothing extra to clean up when swapping the logo or
      // removing it later.
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${user.id}/logo.${ext}`;

      const { error: storageError } = await supabase.storage
        .from("report-logos")
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
      if (storageError) throw storageError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("report-logos").getPublicUrl(path);
      // The path is stable across re-uploads, so without a cache-buster
      // a browser (or the report page's own repeat views) could keep
      // showing the previous image indefinitely after a swap.
      const freshUrl = `${publicUrl}?v=${Date.now()}`;

      const formData = new FormData();
      formData.set("report_logo_url", freshUrl);
      await updateWhiteLabelSettings(formData);

      setLogoUrl(freshUrl);
    } catch {
      setUploadError(t("settings.whiteLabelLogoUploadFailed"));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRemove() {
    setUploadError(null);
    setIsUploading(true);
    try {
      // Best-effort: also delete the actual Storage object, not just the
      // profile's reference to it - otherwise every "remove" leaves an
      // orphaned file sitting in the bucket forever (the fixed
      // <uid>/logo.<ext> path only gets overwritten by a *future*
      // upload, never cleaned up on its own). Derived from the current
      // public URL rather than tracked separately, since that URL
      // already fully encodes the object's path within the bucket.
      const path = logoUrl ? new URL(logoUrl).pathname.split("/report-logos/")[1] : null;
      if (path) {
        try {
          await createClient().storage.from("report-logos").remove([path]);
        } catch {
          // Non-fatal - clearing the profile's reference below is what
          // actually makes the logo disappear from the report; a failed
          // Storage delete just leaves an unreferenced file behind for
          // a future upload to overwrite.
        }
      }

      const formData = new FormData();
      formData.set("report_logo_url", "");
      await updateWhiteLabelSettings(formData);
      setLogoUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      setUploadError(t("settings.whiteLabelLogoUploadFailed"));
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Label className="flex items-center gap-1.5">
          <ImagePlus className="h-3.5 w-3.5 text-muted-foreground" />
          {t("settings.whiteLabelLogoLabel")}
        </Label>

        <div className="flex items-start gap-3">
          {logoUrl && (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white p-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- a
                  user-supplied, arbitrary-domain Supabase Storage URL,
                  not a static/known-host asset next/image can optimize. */}
              <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
              disabled={isUploading}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed px-4 py-5 text-center transition-colors",
                isDragOver ? "border-primary bg-primary/5" : "border-input hover:border-primary/50 hover:bg-accent",
                isUploading && "pointer-events-none opacity-60"
              )}
            >
              {isUploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <ImagePlus className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">
                {isUploading ? t("settings.whiteLabelLogoUploading") : t("settings.whiteLabelLogoDropHint")}
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            {logoUrl && !isUploading && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRemove}
                className="w-fit gap-1.5 text-destructive hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
                {t("settings.whiteLabelLogoRemove")}
              </Button>
            )}
          </div>
        </div>

        {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
        <p className="text-xs text-slate-400">{t("settings.whiteLabelLogoHint")}</p>
      </div>

      <form action={handleCompanySubmit} onChange={markDirty} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report_company_name" className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            {t("settings.whiteLabelCompanyLabel")}
          </Label>
          <Input
            id="report_company_name"
            name="report_company_name"
            placeholder={t("settings.whiteLabelCompanyPlaceholder")}
            defaultValue={initialCompanyName ?? ""}
            maxLength={100}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending} size="sm" className="w-fit">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("settings.slackSave")}
          </Button>
          {saved && <span className="text-sm text-emerald-600">{t("settings.slackSaved")}</span>}
        </div>
      </form>
    </div>
  );
}
