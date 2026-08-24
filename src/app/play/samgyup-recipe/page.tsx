"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { Loader2, Plus, Trophy, Sparkles, Star, ScrollText, Pencil } from "lucide-react";

import { PlayHeader } from "@/components/games/PlayHeader";
import { RecipeCardTile } from "@/components/games/recipe/RecipeCardTile";
import { RecipeSheet } from "@/components/games/recipe/RecipeSheet";
import { RecipeComposer, type ComposerRecipe } from "@/components/games/recipe/RecipeComposer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EMPTY_FEED, type RecipeCard, type RecipeCounts, type RecipeFeed } from "@/lib/games/recipe/types";
import { markView, signalUse } from "@/lib/games/trackGame";

type MyRecipe = {
  id: string;
  title: string;
  displayName: string;
  steps: { itemName: string }[];
  status: string;
  counts: { yummy: number; good: number; yuck: number; total: number };
  stepCount: number;
};

const STATUS_COPY: Record<string, { label: string; className: string }> = {
  pending: { label: "Under review", className: "bg-amber-100 text-amber-900" },
  published: { label: "Live", className: "bg-emerald-100 text-emerald-900" },
  rejected: { label: "Not approved", className: "bg-rose-100 text-rose-900" },
  // One shelf for "not on the board", whether it was turned down at review
  // or pulled after going live. Saying "Hidden" to its author explains nothing.
  hidden: { label: "Not published", className: "bg-zinc-200 text-zinc-700" },
};

export default function SamgyupRecipePage() {
  const [feed, setFeed] = useState<RecipeFeed | null>(null);
  const [mine, setMine] = useState<MyRecipe[] | null>(null);
  const [canPlay, setCanPlay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<ComposerRecipe | null>(null);

  const load = useCallback(async () => {
    const headers: Record<string, string> = {};
    const user = getAuth().currentUser;
    if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;

    const res = await fetch("/api/customer/games/samgyup-recipe/feed", { headers, cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load the board.");

    setFeed(json.feed || EMPTY_FEED);
    setCanPlay(!!json.canPlay);

    // "Mine" is the author's own shelf, and it is the reason a recipe waiting
    // for review is not just silence — they can see it sitting there.
    if (json.canPlay && user) {
      const mineRes = await fetch("/api/customer/games/samgyup-recipe/mine", { headers, cache: "no-store" });
      const mineJson = await mineRes.json().catch(() => ({}));
      if (mineRes.ok && mineJson?.ok) setMine(mineJson.recipes || []);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(getAuth(), () => {
      load().catch((e: any) => setError(e?.message || "Could not load the board."));
    });
    return () => unsub();
  }, [load]);

  const refresh = () => {
    load().catch(() => {});
  };

  /**
   * Open a recipe.
   *
   * A VIEW is opening a recipe, not landing on the board — a diner who scrolls
   * past has not looked at anything. Six opens in one sitting is still one
   * view; the server deduplicates per phone per session.
   */
  const openRecipe = (id: string) => {
    setOpenId(id);
    markView("samgyup-recipe");
  };

  /**
   * Move the number the moment they tap.
   *
   * The list behind the sheet comes from `gameFeeds/samgyup-recipe`, a 90s
   * cache that a vote deliberately never rebuilds — so re-fetching the feed
   * here would hand back the pre-vote count and undo this patch. Patching the
   * card by id costs nothing and is the whole fix for "I rated it and the
   * counter did not move".
   */
  const onVoted = useCallback((recipeId: string, counts: RecipeCounts) => {
    const patch = (list: RecipeCard[]) =>
      list.map((r) => (r.id === recipeId ? { ...r, counts } : r));

    setFeed((f) => (f ? { ...f, top: patch(f.top), fresh: patch(f.fresh), featured: patch(f.featured) } : f));
    setMine((m) => (m ? m.map((r) => (r.id === recipeId ? { ...r, counts } : r)) : m));

    signalUse("samgyup-recipe");
  }, []);

  const empty = (icon: React.ReactNode, title: string, hint: string) => (
    <div className="py-14 text-center">
      <div className="flex justify-center text-zinc-300">{icon}</div>
      <p className="mt-3 font-bold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <>
      <PlayHeader
        title="Paano Ka Mag-Samgyup?"
        subtitle="Share your way. Let others rate it."
        backHref="/play"
      />

      <main className="max-w-3xl mx-auto px-4 py-5 pb-28">
        {error ? (
          <p className="py-16 text-center text-sm text-destructive">{error}</p>
        ) : feed === null ? (
          <div className="py-20 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          /* Top is gated at MIN_VOTES_TO_RANK, so on a young board it is
             empty and the diner's first sight is "No ranked recipes yet".
             Open on Fresh until Top has earned something. */
          <Tabs defaultValue={feed.top.length > 0 ? "top" : "fresh"}>
            <TabsList className="w-full grid grid-cols-4 rounded-2xl">
              <TabsTrigger value="top">Top</TabsTrigger>
              <TabsTrigger value="fresh">Fresh</TabsTrigger>
              <TabsTrigger value="featured">Picks</TabsTrigger>
              <TabsTrigger value="mine">Mine</TabsTrigger>
            </TabsList>

            <TabsContent value="top" className="mt-4 space-y-3">
              {feed.top.length === 0
                ? empty(
                    <Trophy className="h-10 w-10" />,
                    "No ranked recipes yet",
                    "Recipes join the board once enough people have tried them."
                  )
                : feed.top.map((r, i) => (
                    <RecipeCardTile key={r.id} recipe={r} rank={i + 1} onOpen={() => openRecipe(r.id)} />
                  ))}
            </TabsContent>

            <TabsContent value="fresh" className="mt-4 space-y-3">
              {feed.fresh.length === 0
                ? empty(<Sparkles className="h-10 w-10" />, "Nothing new yet", "Be the first to share one.")
                : feed.fresh.map((r) => (
                    <RecipeCardTile key={r.id} recipe={r} onOpen={() => openRecipe(r.id)} />
                  ))}
            </TabsContent>

            <TabsContent value="featured" className="mt-4 space-y-3">
              {feed.featured.length === 0
                ? empty(<Star className="h-10 w-10" />, "No picks yet", "Our team pins their favourites here.")
                : feed.featured.map((r) => (
                    <RecipeCardTile key={r.id} recipe={r} onOpen={() => openRecipe(r.id)} />
                  ))}
            </TabsContent>

            <TabsContent value="mine" className="mt-4 space-y-3">
              {!canPlay ? (
                empty(<ScrollText className="h-10 w-10" />, "Join your table", "Scan the QR or enter your PIN to play.")
              ) : !mine || mine.length === 0 ? (
                empty(<ScrollText className="h-10 w-10" />, "You have not shared one yet", "Tap Share yours below.")
              ) : (
                mine.map((r) => {
                  const s = STATUS_COPY[r.status] ?? STATUS_COPY.pending;
                  return (
                    <div key={r.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-black leading-tight truncate">{r.title}</h3>
                        <Badge className={`rounded-xl shrink-0 hover:bg-inherit ${s.className}`} variant="secondary">
                          {s.label}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.stepCount} steps · 🤤 {r.counts.yummy} 🙂 {r.counts.good} 🤢 {r.counts.yuck}
                      </p>
                      {r.status === "pending" && (
                        <>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Our team will review it and share it with other customers soon. You can
                            keep changing it until then.
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 rounded-xl gap-1"
                            onClick={() =>
                              setEditing({
                                id: r.id,
                                title: r.title,
                                displayName: r.displayName,
                                steps: r.steps,
                              })
                            }
                          >
                            <Pencil className="h-4 w-4" />
                            Edit
                          </Button>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </TabsContent>
          </Tabs>
        )}
      </main>

      {canPlay && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-gradient-to-t from-zinc-50 via-zinc-50 to-transparent px-4 pb-5 pt-8">
          <div className="max-w-3xl mx-auto">
            <Button
              className="w-full h-14 rounded-2xl font-bold text-base shadow-lg"
              onClick={() => setComposing(true)}
            >
              <Plus className="mr-2 h-5 w-5" />
              Share yours
            </Button>
          </div>
        </div>
      )}

      <RecipeSheet recipeId={openId} onClose={() => setOpenId(null)} onVoted={onVoted} />
      <RecipeComposer
        open={composing || !!editing}
        editing={editing}
        onClose={() => {
          setComposing(false);
          setEditing(null);
        }}
        onSaved={() => {
          setComposing(false);
          setEditing(null);
          refresh();
        }}
      />
    </>
  );
}
