"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";
import { deletePrompt } from "./actions";

export function DeletePromptButton({ promptId }: { promptId: string }) {
  const { t } = useI18n();
  return (
    <form
      action={deletePrompt}
      onSubmit={(e) => {
        if (!confirm(t("dashboard.deletePromptConfirm"))) e.preventDefault();
      }}
    >
      <input type="hidden" name="prompt_id" value={promptId} />
      <Button type="submit" variant="ghost" size="icon" aria-label={t("dashboard.delete")}>
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </form>
  );
}
