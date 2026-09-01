"use client";

import { useState, useTransition } from "react";
import { Flag, Pencil, Trash2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n/context";
import { MARKETING_ACTION_CATEGORIES, type MarketingAction, type MarketingActionCategory } from "@/lib/marketing-actions";
import { createMarketingAction, updateMarketingAction, deleteMarketingAction } from "./actions";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface FormState {
  date: string;
  category: MarketingActionCategory;
  title: string;
  notes: string;
}

function emptyForm(): FormState {
  return { date: todayIso(), category: "press_release", title: "", notes: "" };
}

/**
 * "＋施策を記録する" entry point for GEO施策メモ (marketing_actions - see
 * lib/marketing-actions.ts). One dialog handles the whole lifecycle:
 * the add/edit form at the top, and a scrollable list of everything
 * already logged (for this brand, within whatever window the caller
 * passed - see TrendExplorer) below it with per-row edit/delete, rather
 * than a separate management page for what's usually a handful of
 * entries. `actions` is a plain server-fetched prop, so a successful
 * create/update/delete (each already calls revalidatePath) refreshes
 * this list the same way every other list in the app does - no manual
 * client-side cache to keep in sync.
 */
export function MarketingActionDialog({ brandId, actions }: { brandId: string; actions: MarketingAction[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resetForm() {
    setForm(emptyForm());
    setEditingId(null);
    setError(null);
  }

  function startEdit(action: MarketingAction) {
    setEditingId(action.id);
    setForm({ date: action.action_date, category: action.category, title: action.title, notes: action.notes ?? "" });
    setError(null);
  }

  function handleSubmit() {
    if (!form.title.trim()) {
      setError(t("marketingActions.titleRequired"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("brand_id", brandId);
      fd.set("action_date", form.date);
      fd.set("category", form.category);
      fd.set("title", form.title);
      fd.set("notes", form.notes);

      const result = editingId
        ? await (async () => {
            fd.set("action_id", editingId);
            return updateMarketingAction(fd);
          })()
        : await createMarketingAction(fd);

      if (!result.ok) {
        setError(t("marketingActions.saveFailed"));
        return;
      }
      resetForm();
    });
  }

  function handleDelete(actionId: string) {
    if (!confirm(t("marketingActions.deleteConfirm"))) return;
    setDeletingId(actionId);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("action_id", actionId);
      await deleteMarketingAction(fd);
      setDeletingId(null);
      if (editingId === actionId) resetForm();
    });
  }

  // Newest first - the list is for quick edit/delete of something just
  // logged, not a chronological read.
  const recentFirst = [...actions].reverse();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <Flag className="h-3.5 w-3.5" />
          {t("marketingActions.addButton")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingId ? t("marketingActions.editing") : t("marketingActions.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("marketingActions.dialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ma-date">{t("marketingActions.dateLabel")}</Label>
              <Input
                id="ma-date"
                type="date"
                value={form.date}
                max={todayIso()}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ma-category">{t("marketingActions.categoryLabel")}</Label>
              <Select
                id="ma-category"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as MarketingActionCategory }))}
              >
                {MARKETING_ACTION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`marketingActions.category.${c}`)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ma-title">{t("marketingActions.titleLabel")}</Label>
            <Input
              id="ma-title"
              value={form.title}
              maxLength={200}
              placeholder={t("marketingActions.titlePlaceholder")}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ma-notes">{t("marketingActions.notesLabel")}</Label>
            <Textarea
              id="ma-notes"
              value={form.notes}
              maxLength={2000}
              placeholder={t("marketingActions.notesPlaceholder")}
              className="min-h-[70px]"
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          {editingId && (
            <Button type="button" variant="ghost" size="sm" onClick={resetForm} disabled={isPending}>
              {t("settings.cancel")}
            </Button>
          )}
          <Button type="button" size="sm" onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingId ? t("marketingActions.update") : t("marketingActions.save")}
          </Button>
        </DialogFooter>

        {recentFirst.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("marketingActions.recentTitle")}
            </p>
            <ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
              {recentFirst.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-md border border-border p-2 text-xs">
                  <Badge variant="outline" className="shrink-0">
                    {t(`marketingActions.category.${a.category}`)}
                  </Badge>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{a.action_date}</span>
                  <span className="min-w-0 flex-1 truncate" title={a.title}>
                    {a.title}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => startEdit(a)}
                    aria-label={t("marketingActions.edit")}
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => handleDelete(a.id)}
                    disabled={isPending && deletingId === a.id}
                    aria-label={t("dashboard.delete")}
                  >
                    {isPending && deletingId === a.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
