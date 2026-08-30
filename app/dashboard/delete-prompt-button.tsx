"use client";

import { useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";
import { deletePrompt } from "./actions";

export function DeletePromptButton({ promptId }: { promptId: string }) {
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    // Guards the same rapid-double-click case every other submit
    // button in this file's siblings already guards against (disabled
    // + a spinner while pending) - a plain `action={deletePrompt}` form
    // had no pending state at all, so a second click before the first
    // request finished could fire deletePrompt twice.
    startTransition(async () => {
      await deletePrompt(formData);
    });
  }

  return (
    <form
      action={handleSubmit}
      onSubmit={(e) => {
        if (!confirm(t("dashboard.deletePromptConfirm"))) e.preventDefault();
      }}
    >
      <input type="hidden" name="prompt_id" value={promptId} />
      <Button type="submit" variant="ghost" size="icon" disabled={isPending} aria-label={t("dashboard.delete")}>
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>
    </form>
  );
}
