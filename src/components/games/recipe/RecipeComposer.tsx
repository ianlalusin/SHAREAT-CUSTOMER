"use client";

import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { Loader2, Plus, X } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_STEPS, MIN_STEPS, MAX_TITLE_LEN, MAX_DISPLAY_NAME_LEN, MAX_STEP_LEN,
} from "@/lib/games/recipe/validate";

export type ComposerRecipe = {
  id: string;
  title: string;
  displayName: string;
  steps: { itemName: string }[];
};

/**
 * Write a recipe, in your own words.
 *
 * The steps are the screen. There is no mode picker and no menu shortcut — the
 * first two boxes are there the moment it opens, because the fastest way to get
 * someone writing is to put the cursor where the writing goes.
 *
 * The first two steps carry no delete control: two is the minimum, so removing
 * one is never a legal move and offering the button would only produce a
 * rejection. Steps three and up can be deleted outright.
 *
 * Used for both composing and for an author fixing a recipe that is still
 * waiting for review — same rules, same shape, so the two cannot drift.
 */
export function RecipeComposer({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing?: ComposerRecipe | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isMobile = useIsMobile();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [steps, setSteps] = useState<string[]>(["", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDisplayName(editing.displayName);
      const existing = editing.steps.map((s) => s.itemName);
      // Never open below the minimum, even if stored data somehow is.
      while (existing.length < MIN_STEPS) existing.push("");
      setSteps(existing);
    } else {
      setTitle("");
      setDisplayName("");
      setSteps(["", ""]);
    }
    setError(null);
  }, [open, editing]);

  const filled = steps.filter((s) => s.trim()).length;
  const canSubmit = !!title.trim() && filled >= MIN_STEPS && !submitting;

  const setStep = (i: number, value: string) =>
    setSteps((prev) => prev.map((s, j) => (j === i ? value : s)));

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Join your table to share a recipe.");

      const payload = {
        title,
        displayName,
        // Blank boxes are dropped rather than rejected — someone who adds a
        // step and changes their mind should not have to hunt for the X.
        steps: steps.map((s) => s.trim()).filter(Boolean).map((itemName) => ({ kind: "free", itemName })),
      };

      const url = editing
        ? `/api/customer/games/samgyup-recipe/recipes/${editing.id}/edit`
        : "/api/customer/games/samgyup-recipe/recipes";

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not save your recipe.");

      toast({
        title: editing ? "Changes saved" : "Recipe sent!",
        description: editing
          ? "You can keep editing until our team approves it."
          : "Our team will review your recipe and share it with other customers soon.",
      });
      onSaved();
    } catch (e: any) {
      setError(e?.message || "Could not save your recipe.");
    } finally {
      setSubmitting(false);
    }
  };

  const body = (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="recipe-title">Recipe name</Label>
        <Input
          id="recipe-title"
          value={title}
          maxLength={MAX_TITLE_LEN}
          placeholder="e.g. Lola's secret wrap"
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Your steps</Label>
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary text-sm font-black flex items-center justify-center">
              {i + 1}
            </span>
            <Input
              value={s}
              maxLength={MAX_STEP_LEN}
              placeholder={i === 0 ? "First, what do you do?" : `Then what?`}
              onChange={(e) => setStep(i, e.target.value)}
              className="h-12 flex-1"
            />
            {/* Steps 1 and 2 are the minimum, so there is nothing to delete. */}
            {i >= MIN_STEPS ? (
              <button
                type="button"
                aria-label={`Remove step ${i + 1}`}
                onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-zinc-500 hover:bg-rose-50 hover:text-rose-600 active:scale-95 transition"
              >
                <X className="h-5 w-5" />
              </button>
            ) : (
              <span className="h-10 w-10 shrink-0" aria-hidden />
            )}
          </div>
        ))}

        {steps.length < MAX_STEPS && (
          // Padded by the same badge and delete-button widths as a step row, so
          // it lines up with the boxes above it rather than running wider.
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 shrink-0" aria-hidden />
            <button
              type="button"
              onClick={() => setSteps((prev) => [...prev, ""])}
              className="flex-1 h-12 rounded-md bg-red-600 text-white font-bold flex items-center justify-center gap-2 hover:bg-red-700 active:scale-[0.99] transition"
            >
              <Plus className="h-5 w-5" />
              Add step
            </button>
            <span className="h-10 w-10 shrink-0" aria-hidden />
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="recipe-name">Show my name as</Label>
        <Input
          id="recipe-name"
          value={displayName}
          maxLength={MAX_DISPLAY_NAME_LEN}
          placeholder="e.g. Ana"
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Everyone who sees your recipe sees this. Leave it blank to stay a guest.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1 h-12 rounded-2xl" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button className="flex-1 h-12 rounded-2xl font-bold" disabled={!canSubmit} onClick={submit}>
          {submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
          {editing ? "Save changes" : "Submit"}
        </Button>
      </div>
    </div>
  );

  const heading = editing ? "Edit your recipe" : "Share your samgyup";
  const sub = editing
    ? "You can keep changing this until our team approves it."
    : "Write your steps. Others will try it and rate it.";

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{heading}</DrawerTitle>
            <DrawerDescription>{sub}</DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>{sub}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
