"use client";

import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { Loader2 } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VerdictButtons } from "./VerdictButtons";
import type { RecipeCounts, RecipeStep, Verdict } from "@/lib/games/recipe/types";
import { attributionFor } from "@/lib/games/recipe/attribution";

type Detail = {
  id: string;
  title: string;
  displayName: string;
  storeName: string;
  steps: RecipeStep[];
  counts: { yuck: number; good: number; yummy: number; total: number };
};

/**
 * A recipe, opened from the list.
 *
 * Drawer on mobile / Dialog on desktop, matching CustomerCatalog's EntrySheet —
 * the established convention for every "open a detail from a list" interaction
 * in this app.
 */
export function RecipeSheet({
  recipeId,
  onClose,
  onVoted,
}: {
  recipeId: string | null;
  onClose: () => void;
  /** Hands the fresh tallies back so the LIST can be patched. The board behind
   *  this sheet is a 90s cache that a vote deliberately never rebuilds, so
   *  without these numbers the card the diner returns to still shows the count
   *  from before they tapped. */
  onVoted: (recipeId: string, counts: RecipeCounts) => void;
}) {
  const isMobile = useIsMobile();
  const { toast } = useToast();

  const [detail, setDetail] = useState<Detail | null>(null);
  const [canVote, setCanVote] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recipeId) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const headers: Record<string, string> = {};
        const user = getAuth().currentUser;
        if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;

        const res = await fetch(`/api/customer/games/samgyup-recipe/recipes/${recipeId}`, {
          headers,
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not open that recipe.");

        setDetail(json.recipe);
        setCanVote(!!json.canVote);
        setReason(json.reason ?? null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not open that recipe.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  const submitVote = async (verdict: Verdict) => {
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Join your table to rate this.");

      const res = await fetch(`/api/customer/games/samgyup-recipe/recipes/${recipeId}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ verdict }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not save your rating.");

      setDetail((d) => (d ? { ...d, counts: json.counts } : d));
      setCanVote(false);
      setReason("voted");
      toast({ title: "Thanks!", description: "Your rating is in." });
      onVoted(recipeId!, json.counts as RecipeCounts);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Couldn't rate that", description: e?.message ?? "Please try again." });
    }
  };

  const body = error ? (
    <p className="py-10 text-center text-sm text-destructive">{error}</p>
  ) : !detail ? (
    <div className="py-16 flex items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
    </div>
  ) : (
    <div className="space-y-5">
      <ol className="space-y-2">
        {detail.steps.map((s, i) => (
          <li key={i} className="rounded-2xl border bg-white p-3 flex gap-3">
            <span className="h-6 w-6 shrink-0 rounded-full bg-primary/10 text-primary text-xs font-black flex items-center justify-center">
              {i + 1}
            </span>
            <span className="min-w-0">
              {/* itemName, never catalogItemId — recipes travel between branches
                  and the id means nothing at another store. */}
              <span className="font-bold">
                {s.verb ? `${s.verb} ` : ""}
                {s.itemName}
              </span>
              {s.note ? <span className="block text-sm text-muted-foreground">{s.note}</span> : null}
            </span>
          </li>
        ))}
      </ol>

      <div className="text-center">
        <div className="flex items-center justify-center gap-4 text-sm">
          <span>🤤 {detail.counts.yummy}</span>
          <span>🙂 {detail.counts.good}</span>
          <span>🤢 {detail.counts.yuck}</span>
        </div>
        {/* The tallies alone never say how many people that is, so a recipe
            with one Yummy and one with forty read the same at a glance. */}
        <p className="mt-1 text-xs text-muted-foreground">
          {detail.counts.total === 0
            ? "No ratings yet"
            : `${detail.counts.total} ${detail.counts.total === 1 ? "rating" : "ratings"}`}
        </p>
      </div>

      <VerdictButtons canVote={canVote} reason={reason} onVote={submitVote} />
    </div>
  );

  const title = detail?.title || "Recipe";
  const by = detail ? attributionFor(detail.displayName, detail.storeName) : null;
  const subtitle = by ? `by: ${by.name}${by.store ? ` · ${by.store}` : ""}` : " ";
  const open = !!recipeId;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{subtitle}</DrawerDescription>
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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
