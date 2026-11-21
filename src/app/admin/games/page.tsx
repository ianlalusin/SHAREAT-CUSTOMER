"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { ArrowLeft, Loader2, RefreshCw, Check, X, Archive, Undo2, Star, StarOff, Pencil } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RecipeStep } from "@/lib/games/recipe/types";
import { RecipeEditDialog, type EditableRecipe } from "@/components/games/recipe/RecipeEditDialog";
import { GamePlayStats } from "@/components/games/admin/GamePlayStats";
import { RecipeScoreLine } from "@/components/games/recipe/RecipeScoreLine";

type GameRow = { id: string; title: string; tagline: string; configured: boolean; isActive: boolean; disabledStoreIds: string[] };
type StoreRow = { storeId: string; name: string };
type QueueRow = {
  id: string;
  title: string;
  displayName: string;
  storeName: string;
  storeId: string;
  steps: RecipeStep[];
  hasFreeText: boolean;
  status: string;
  featured: boolean;
  counts: { yuck: number; good: number; yummy: number; total: number };
  rankScore: number;
  createdAtMs: number;
};

/**
 * Three shelves, not four.
 *
 * "archived" is a VIEW, not a stored status: rejecting at review and pulling a
 * live recipe are the same act — off every shelf, kept on file, reversible —
 * and giving them separate tabs meant nobody ever opened the second one. The
 * route reads both `hidden` and the legacy `rejected` behind this one label.
 */
const STATUSES = ["pending", "published", "archived"] as const;

const STATUS_LABEL: Record<(typeof STATUSES)[number], string> = {
  pending: "Pending",
  published: "Live",
  archived: "Archived",
};

export default function AdminGamesPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [games, setGames] = useState<GameRow[] | null>(null);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [openBranches, setOpenBranches] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("pending");
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [editing, setEditing] = useState<EditableRecipe | null>(null);

  const authed = useCallback(async () => {
    const user = getAuth().currentUser;
    if (!user) throw new Error("Not signed in.");
    return { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" };
  }, []);

  const loadGames = useCallback(async () => {
    const res = await fetch("/api/admin/games", { headers: await authed(), cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load games.");
    setGames(json.games || []);
    setPendingCount(Number(json.pendingCount || 0));
  }, [authed]);

  const loadStores = useCallback(async () => {
    const res = await fetch("/api/admin/my-stores", { headers: await authed(), cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.ok) setStores(json.stores || []);
  }, [authed]);

  const loadQueue = useCallback(
    async (next: (typeof STATUSES)[number]) => {
      setQueue(null);
      const res = await fetch(`/api/admin/games/samgyup-recipe/queue?status=${next}`, {
        headers: await authed(),
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load recipes.");
      setQueue(json.recipes || []);
    },
    [authed]
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(getAuth(), (user) => {
      if (!user) {
        router.push("/admin/login");
        return;
      }
      loadStores().catch(() => {});
      loadGames().catch((e: any) =>
        toast({ variant: "destructive", title: "Couldn't load", description: e?.message })
      );
      loadQueue(status).catch((e: any) =>
        toast({ variant: "destructive", title: "Couldn't load", description: e?.message })
      );
    });
    return () => unsub();
    // `status` drives its own reload below; including it here would double-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const toggleGame = async (gameId: string, isActive: boolean) => {
    try {
      const res = await fetch("/api/admin/games", {
        method: "PUT",
        headers: await authed(),
        body: JSON.stringify({ gameId, isActive }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not update.");
      await loadGames();
      toast({ title: isActive ? "Game switched on" : "Game switched off" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Couldn't update", description: e?.message });
    }
  };

  // Same subtractive switch a branch manager has (PUT /api/manager/games); an admin passes its store check for every branch.
  const toggleBranch = async (gameId: string, storeId: string, enabled: boolean) => {
    try {
      const res = await fetch("/api/manager/games", {
        method: "PUT",
        headers: await authed(),
        body: JSON.stringify({ gameId, storeId, enabled }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not update.");
      await loadGames();
    } catch (e) {
      toast({ variant: "destructive", title: "Couldn't update", description: (e as Error)?.message });
    }
  };

  const moderate = async (recipeId: string, action: string) => {
    setBusyId(recipeId);
    try {
      const res = await fetch("/api/admin/games/samgyup-recipe/moderate", {
        method: "POST",
        headers: await authed(),
        body: JSON.stringify({ recipeId, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not update.");
      await Promise.all([loadQueue(status), loadGames()]);
      toast({ title: "Done" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Couldn't update", description: e?.message });
    } finally {
      setBusyId(null);
    }
  };

  const rebuild = async () => {
    setRebuilding(true);
    try {
      const res = await fetch("/api/admin/games/samgyup-recipe/rebuild-feed", {
        method: "POST",
        headers: await authed(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not rebuild.");
      toast({
        title: "Board rebuilt",
        description: `Top ${json.counts.top} · Fresh ${json.counts.fresh} · Picks ${json.counts.featured}`,
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Couldn't rebuild", description: e?.message });
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => router.push("/admin")} className="gap-2 -ml-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button variant="outline" onClick={rebuild} disabled={rebuilding} className="gap-2 rounded-2xl">
            {rebuilding ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Rebuild board
          </Button>
        </div>

        <Card className="rounded-[2rem] border-none shadow-xl bg-white">
          <CardHeader>
            <CardTitle className="text-xl font-black">Games</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {games === null ? (
              <div className="py-6 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              games.map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-4 rounded-2xl border p-4">
                  <div className="min-w-0">
                    <p className="font-bold truncate">{g.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{g.tagline}</p>
                    {!g.configured && (
                      <p className="mt-1 text-xs text-amber-700">Never switched on — diners cannot see it.</p>
                    )}
                    {g.id === "ghost-hunt" && (
                      <button
                        type="button"
                        onClick={() => router.push("/admin/games/ghost-hunt")}
                        className="mt-1 text-xs font-bold text-primary underline"
                      >
                        Settings per branch
                      </button>
                    )}
                    {g.id !== "ghost-hunt" && g.isActive && stores.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setOpenBranches(openBranches === g.id ? null : g.id)}
                        className="mt-1 text-xs font-bold text-primary underline"
                      >
                        {openBranches === g.id ? "Hide branches" : `Branches (${stores.filter((s) => !g.disabledStoreIds.includes(s.storeId)).length}/${stores.length} on)`}
                      </button>
                    )}
                    {openBranches === g.id && (
                      <div className="mt-2 space-y-2">
                        {stores.map((s) => (
                          <label key={s.storeId} className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate">{s.name}</span>
                            <Switch
                              checked={!g.disabledStoreIds.includes(s.storeId)}
                              onCheckedChange={(v) => toggleBranch(g.id, s.storeId, v)}
                            />
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Ghost Hunt is switched on and off per branch, on its own settings page. */}
                  {g.id === "ghost-hunt" ? (
                    <span className="shrink-0 text-xs font-bold text-muted-foreground">Per branch</span>
                  ) : (
                    <Switch checked={g.isActive} onCheckedChange={(v) => toggleGame(g.id, v)} />
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <GamePlayStats />

        <Card className="rounded-[2rem] border-none shadow-xl bg-white">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-black">Recipes</CardTitle>
              {pendingCount > 0 && (
                <Badge className="rounded-xl">{pendingCount} waiting</Badge>
              )}
            </div>
            <Tabs
              value={status}
              onValueChange={(v) => {
                const next = v as (typeof STATUSES)[number];
                setStatus(next);
                loadQueue(next).catch((e: any) =>
                  toast({ variant: "destructive", title: "Couldn't load", description: e?.message })
                );
              }}
            >
              <TabsList className="grid grid-cols-3 rounded-2xl">
                {STATUSES.map((s) => (
                  <TabsTrigger key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </CardHeader>

          <CardContent className="space-y-3">
            {queue === null ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : queue.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nothing here.</p>
            ) : (
              queue.map((r) => (
                <div key={r.id} className="rounded-2xl border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.displayName} · {r.storeName} · {new Date(r.createdAtMs).toLocaleString()}
                      </p>
                      <RecipeScoreLine counts={r.counts} rankScore={r.rankScore} />
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {r.featured && <Badge className="rounded-xl bg-amber-500">Pick</Badge>}
                      <Badge variant="outline" className="rounded-xl">
                        {r.steps.length} steps
                      </Badge>
                    </div>
                  </div>

                  <ol className="space-y-1 text-sm">
                    {r.steps.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-muted-foreground">{i + 1}.</span>
                        <span>
                          <span className="font-medium">
                            {s.verb ? `${s.verb} ` : ""}
                            {s.itemName}
                          </span>
                          {s.note ? <span className="text-muted-foreground"> — {s.note}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ol>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="rounded-xl gap-1" disabled={busyId === r.id}
                      onClick={() => setEditing({
                        id: r.id, title: r.title, displayName: r.displayName,
                        steps: r.steps, counts: r.counts,
                      })}>
                      <Pencil className="h-4 w-4" /> Edit
                    </Button>
                    {r.status !== "published" && (
                      <Button size="sm" className="rounded-xl gap-1" disabled={busyId === r.id}
                        onClick={() => moderate(r.id, "approve")}>
                        {r.status === "pending" ? <Check className="h-4 w-4" /> : <Undo2 className="h-4 w-4" />}
                        {/* An archived or rejected recipe is not being approved
                            for the first time — it is being put back. */}
                        {r.status === "pending" ? "Approve" : "Restore"}
                      </Button>
                    )}
                    {r.status === "published" && (
                      <Button size="sm" variant="outline" className="rounded-xl gap-1" disabled={busyId === r.id}
                        onClick={() => moderate(r.id, "hide")}>
                        <Archive className="h-4 w-4" /> Archive
                      </Button>
                    )}
                    {r.status === "pending" && (
                      <Button size="sm" variant="outline" className="rounded-xl gap-1" disabled={busyId === r.id}
                        onClick={() => moderate(r.id, "reject")}>
                        <X className="h-4 w-4" /> Reject
                      </Button>
                    )}
                    {r.status === "published" && (
                      <Button size="sm" variant="outline" className="rounded-xl gap-1" disabled={busyId === r.id}
                        onClick={() => moderate(r.id, r.featured ? "unfeature" : "feature")}>
                        {r.featured ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />}
                        {r.featured ? "Unpin" : "Pin as pick"}
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <RecipeEditDialog
        recipe={editing}
        onClose={() => setEditing(null)}
        onSaved={(resetRatings) => {
          setEditing(null);
          loadQueue(status).catch(() => {});
          toast({
            title: "Recipe updated",
            description: resetRatings ? "Ratings were cleared — the steps changed." : "Ratings kept.",
          });
        }}
      />
    </main>
  );
}
