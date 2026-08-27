"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPrompt } from "./actions";

export function PromptForm({ brandId }: { brandId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createPrompt(formData);
        formRef.current?.reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "登録に失敗しました");
      }
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="brand_id" value={brandId} />
      <Input
        name="text"
        placeholder="例: 中小企業向けのおすすめCRMツールは？"
        required
        className="flex-1"
      />
      <Input
        name="category"
        placeholder="グループ名(任意)"
        className="sm:w-40"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={isPending} size="sm">
        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
        追加
      </Button>
    </form>
  );
}
