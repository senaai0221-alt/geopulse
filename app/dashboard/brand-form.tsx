"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineAlert } from "@/components/ui/inline-alert";
import { createBrand } from "./actions";

export function BrandForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createBrand(formData);
        formRef.current?.reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "登録に失敗しました");
      }
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">ブランド名</Label>
          <Input id="name" name="name" placeholder="例: Zonostick" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="domain">ドメイン（任意）</Label>
          <Input id="domain" name="domain" placeholder="example.com" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="competitors">競合（カンマ区切り）</Label>
          <Input id="competitors" name="competitors" placeholder="競合A, 競合B" />
        </div>
      </div>
      {error && <InlineAlert>{error}</InlineAlert>}
      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
        ブランドを追加
      </Button>
    </form>
  );
}
