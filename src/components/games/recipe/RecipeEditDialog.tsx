"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, AlertTriangle } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { effectOfEdit } from "@/lib/games/recipe/edit";
import { MAX_STEPS, MAX_TITLE_LEN, MAX_DISPLAY_NAME_LEN, MAX_NOTE_LEN } from "@/lib/games/recipe/validate";
import type { RecipeStep } from "@/lib/games/recipe/types";

export type EditableRecipe = {
  id: string;
  title: string;
  displayName: string;
  steps: RecipeStep[];
  counts: { yuck: number; good: number; yummy: number; total: number };
};

/**
 * Staff edit of a published recipe.
 *
 * The consequence is previewed live, not explained after the fact: changing the
 * steps clears the ratings, and an admin should see that before they commit,
 * not discover it in a toast. `effectOfEdit` is the same pure function the
 * server decides with, so the warning cannot drift from the behaviour.
 */
export function RecipeEditDialog({
  recipe,
  onClose,
  onSaved,
}: {
  recipe: EditableRecipe | null;
  onClose: () => void;
  onSaved: (resetRatings: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [steps, setSteps] = useState<RecipeStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recipe) return;
    setTitle(recipe.title);
    setDisplayName(recipe.displayName);
    setSteps(recipe.steps.map((s) => ({ ...s })));
    setError(null);
  }, [recipe]);

  if (!recipe) return null;

  const effect = effectOfEdit(
    { steps: recipe.steps, title: recipe.title, displayName: recipe.displayName },
    { steps, title: title.trim(), displayName: displayName.trim() }
  );
  const willClear = effect.resetRatings && recipe.counts.total > 0;

  const patch = (i: number, field: keyof RecipeStep, value: string) =>
    setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, [field]: value } : s)));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { getAuth } = await import("firebase/auth");
      const user = getAuth().currentUser;
      if (!user) throw new Error("Not signed in.");

      const res = await fetch("/api/admin/games/samgyup-recipe/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ recipeId: recipe.id, title, displayName, steps }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not save the edit.");
      onSaved(!!json.resetRatings);
    } catch (e: any) {
      setError(e?.message || "Could not save the edit.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit recipe</DialogTitle>
          <DialogDescription>
            {recipe.counts.total > 0
              ? `${recipe.counts.total} ${recipe.counts.total === 1 ? "person has" : "people have"} rated this.`
              : "Nobody has rated this yet."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Recipe name</Label>
            <Input value={title} maxLength={MAX_TITLE_LEN} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Shown as</Label>
            <Input
              value={displayName}
              maxLength={MAX_DISPLAY_NAME_LEN}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Steps ({steps.length}/{MAX_STEPS})</Label>
            {steps.map((s, i) => (
              <div key={i} className="rounded-2xl border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="h-6 w-6 shrink-0 rounded-full bg-primary/10 text-primary text-xs font-black flex items-center justify-center">
                    {i + 1}
                  </span>
                  <Input
                    value={s.itemName}
                    maxLength={40}
                    placeholder="What"
                    onChange={(e) => patch(i, "itemName", e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={`Remove step ${i + 1}`}
                    onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                    className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-zinc-400 hover:bg-zinc-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <Input
                  value={s.note || ""}
                  maxLength={MAX_NOTE_LEN}
                  placeholder="Tip (optional)"
                  onChange={(e) => patch(i, "note", e.target.value)}
                />
              </div>
            ))}

            {steps.length < MAX_STEPS && (
              <Button
                variant="outline"
                className="w-full rounded-2xl"
                onClick={() => setSteps((prev) => [...prev, { kind: "free", itemName: "" }])}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add step
              </Button>
            )}
          </div>

          {willClear && (
            <div className="flex gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                The steps changed, so the {recipe.counts.total} existing{" "}
                {recipe.counts.total === 1 ? "rating" : "ratings"} will be cleared — they describe the
                old version. Fixing only the name keeps them.
              </span>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || effect.reason === "No changes."}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {willClear ? "Save and clear ratings" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
