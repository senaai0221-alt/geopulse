"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";
import { signOut } from "./actions";

export function SignOutButton() {
  const { t } = useI18n();
  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost" size="sm">
        <LogOut className="mr-2 h-4 w-4" />
        {t("nav.logout")}
      </Button>
    </form>
  );
}
