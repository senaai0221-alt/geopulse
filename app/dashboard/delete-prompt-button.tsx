"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deletePrompt } from "./actions";

export function DeletePromptButton({ promptId }: { promptId: string }) {
  return (
    <form
      action={deletePrompt}
      onSubmit={(e) => {
        if (!confirm("このプロンプトを削除しますか？")) e.preventDefault();
      }}
    >
      <input type="hidden" name="prompt_id" value={promptId} />
      <Button type="submit" variant="ghost" size="icon" aria-label="削除">
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </form>
  );
}
