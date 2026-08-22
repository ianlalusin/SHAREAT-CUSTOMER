"use client";

import { useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import { Loader2, Plus, Trash2, Zap, PencilLine } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  QUICK_TITLES, MAX_STEPS, MIN_STEPS, MAX_TITLE_LEN, MAX_DISPLAY_NAME_LEN, MAX_NOTE_LEN,
} from "@/lib/games/recipe/validate";

type CatalogItem = { id: string; name: string };
type DraftStep = { kind: "catalog" | "free"; itemName: string; catalogItemId?: string; note?: string };

/**
 * Compose a recipe.
 *
 * Two modes, and the difference is not cosmetic — it decides whether the recipe
 * goes live now or waits for a human:
 *
 *   Quick  — a template title and steps picked from this store's menu. Contains
 *            no text the diner wrote, so there is nothing for a reviewer to
 *            catch and it publishes immediately.
 *   Custom — own title, own name, own notes. Every one of those is text a
 *            stranger will read under the SharEat name, so it waits for review.
 *
 * The mode is a UI affordance only. The server re-derives it from the content
 * (validateRecipeDraft), so a crafted request cannot buy itself the fast path.
 */
export function RecipeComposer({
  open,
  onClose,
  onPublished,
}: {
  open: boolean;
  onClose: () => void;
  onPublished: (published: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const { toast } = useToast();

  const [mode, setMode] = useState<"quick" | "custom">("quick");
  const [title, setTitle] = useState<string>(QUICK_TITLES[0]);
  const [displayName, setDisplayName] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        const user = getAuth().currentUser;
        if (!user) return;
        const res = await fetch("/api/customer/catalog-items", {
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !json?.ok) return;

        // The catalog comes back grouped by category; the composer only needs a
        // flat pick-list of names.
        const flat: CatalogItem[] = [];
        for (const cat of json.categories || []) {
          for (const item of cat.items || []) {
            if (item?.id && item?.name) flat.push({ id: String(item.id), name: String(item.name) });
          }
        }
        const seen = new Set<string>();
        setCatalog(flat.filter((i) => !seen.has(i.id) && seen.add(i.id)));
      } catch {
        if (!cancelled) setCatalog([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const switchMode = (next: "quick" | "custom") => {
    setMode(next);
    setError(null);
    // Leaving Quick keeps the template title as a starting point; entering
    // Quick must snap back to one, or the recipe silently takes the slow path.
    if (next === "quick" && !(QUICK_TITLES as readonly string[]).includes(title)) {
      setTitle(QUICK_TITLES[0]);
    }
  };

  const addStep = (item?: CatalogItem) => {
    if (steps.length >= MAX_STEPS) return;
    setSteps((s) => [
      ...s,
      item ? { kind: "catalog", itemName: item.name, catalogItemId: item.id } : { kind: "free", itemName: "" },
    ]);
  };

  const canSubmit = steps.length >= MIN_STEPS && steps.every((s) => s.itemName.trim()) && !submitting;

  const willBeReviewed = useMemo(() => {
    if (mode === "custom") return true;
    return steps.some((s) => s.kind === "free" || (s.note || "").trim());
  }, [mode, steps]);

  const reset = () => {
    setMode("quick");
    setTitle(QUICK_TITLES[0]);
    setDisplayName("");
    setSteps([]);
    setError(null);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Join your table to publish.");

      const res = await fetch("/api/customer/games/samgyup-recipe/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ title, displayName: mode === "custom" ? displayName : "", steps }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not publish.");

      toast({
        title: json.published ? "It's live!" : "Sent for review",
        description: json.published
          ? "Your recipe is on the board. See if anyone likes it."
          : "Our team checks recipes with your own words in them — usually within a day.",
      });
      reset();
      onPublished(!!json.published);
    } catch (e: any) {
      setError(e?.message || "Could not publish.");
    } finally {
      setSubmitting(false);
    }
  };

  const body = (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => switchMode("quick")}
          className={cn(
            "rounded-2xl border-2 p-3 text-left transition active:scale-[0.98]",
            mode === "quick" ? "border-primary bg-primary/5" : "border-zinc-200 bg-white"
          )}
        >
          <Zap className="h-4 w-4 text-primary" />
          <span className="mt-1 block font-bold text-sm">Quick</span>
          <span className="block text-xs text-muted-foreground">Goes live right away</span>
        </button>
        <button
          type="button"
          onClick={() => switchMode("custom")}
          className={cn(
            "rounded-2xl border-2 p-3 text-left transition active:scale-[0.98]",
            mode === "custom" ? "border-primary bg-primary/5" : "border-zinc-200 bg-white"
          )}
        >
          <PencilLine className="h-4 w-4 text-primary" />
          <span className="mt-1 block font-bold text-sm">In my own words</span>
          <span className="block text-xs text-muted-foreground">Checked by our team first</span>
        </button>
      </div>

      <div className="space-y-1">
        <Label>Recipe name</Label>
        {mode === "quick" ? (
          <div className="flex flex-wrap gap-2">
            {QUICK_TITLES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTitle(t)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition active:scale-95",
                  title === t ? "border-primary bg-primary text-white" : "border-zinc-200 bg-white"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        ) : (
          <Input
            value={title}
            maxLength={MAX_TITLE_LEN}
            placeholder="e.g. Lola's secret wrap"
            onChange={(e) => setTitle(e.target.value)}
          />
        )}
      </div>

      {mode === "custom" && (
        <div className="space-y-1">
          <Label>Show my name as</Label>
          <Input
            value={displayName}
            maxLength={MAX_DISPLAY_NAME_LEN}
            placeholder="e.g. Ana"
            onChange={(e) => setDisplayName(e.target.value)}
          />
          {/*
            The session's booking name belongs to the whole table, not to this
            diner, so it is never published. If they leave this blank the recipe
            is credited to "Guest • <store>".
          */}
          <p className="text-xs text-muted-foreground">
            Everyone who sees your recipe sees this. Leave it blank to stay a guest.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Steps ({steps.length}/{MAX_STEPS})</Label>
          {steps.length > 0 && (
            <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setSteps([])}>
              Clear
            </button>
          )}
        </div>

        {steps.length === 0 && (
          <p className="text-sm text-muted-foreground">Add at least {MIN_STEPS} steps to publish.</p>
        )}

        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="rounded-2xl border bg-white p-3">
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 shrink-0 rounded-full bg-primary/10 text-primary text-xs font-black flex items-center justify-center">
                  {i + 1}
                </span>
                {s.kind === "free" ? (
                  <Input
                    value={s.itemName}
                    maxLength={40}
                    placeholder="Do what?"
                    onChange={(e) =>
                      setSteps((prev) => prev.map((p, j) => (j === i ? { ...p, itemName: e.target.value } : p)))
                    }
                  />
                ) : (
                  <span className="flex-1 font-bold text-sm">{s.itemName}</span>
                )}
                <button
                  type="button"
                  aria-label={`Remove step ${i + 1}`}
                  onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                  className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-zinc-400 hover:bg-zinc-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {mode === "custom" && (
                <Input
                  className="mt-2"
                  value={s.note || ""}
                  maxLength={MAX_NOTE_LEN}
                  placeholder="Add a tip (optional)"
                  onChange={(e) =>
                    setSteps((prev) => prev.map((p, j) => (j === i ? { ...p, note: e.target.value } : p)))
                  }
                />
              )}
            </li>
          ))}
        </ol>

        {steps.length < MAX_STEPS && (
          <div className="space-y-2">
            {catalog === null ? (
              <div className="py-3 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {catalog.slice(0, 24).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addStep(item)}
                    className="rounded-full border bg-white px-3 py-1.5 text-sm hover:border-primary active:scale-95 transition"
                  >
                    + {item.name}
                  </button>
                ))}
              </div>
            )}
            {mode === "custom" && (
              <Button variant="outline" className="w-full rounded-2xl" onClick={() => addStep()}>
                <Plus className="mr-2 h-4 w-4" />
                Write my own step
              </Button>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2">
        <Button className="w-full h-12 rounded-2xl font-bold" disabled={!canSubmit} onClick={submit}>
          {submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
          {willBeReviewed ? "Send for review" : "Publish now"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {willBeReviewed
            ? "Recipes in your own words are checked by our team first."
            : "Built from the menu, so it goes live right away."}
        </p>
      </div>
    </div>
  );

  const heading = "Share your samgyup";
  const sub = "A few steps. Others will try it and rate it.";

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
