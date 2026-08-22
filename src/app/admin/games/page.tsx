"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { ArrowLeft, Loader2, RefreshCw, Check, X, EyeOff, Star, StarOff, Sprout } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RecipeStep } from "@/lib/games/recipe/types";

type GameRow = { id: string; title: string; tagline: string; configured: boolean; isActive: boolean };
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
  createdAtMs: number;
};

const STATUSES = ["pending", "published", "hidden", "rejected"] as const;

export default function AdminGamesPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [games, setGames] = useState<GameRow[] | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("pending");
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [seeding, setSeeding] = useState(false);

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

  /**
   * House recipes give the board something to show on day one. A feed that
   * opens empty gets no ratings, so it never fills up.
   */
  const seed = async (remove: boolean) => {
    setSeeding(true);
    try {
      const res = await fetch("/api/admin/games/samgyup-recipe/seed", {
        method: "POST",
        headers: await authed(),
        body: JSON.stringify({ remove }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not update house recipes.");
      await loadQueue(status);
      toast({
        title: remove ? `Removed ${json.removed}` : `Added ${json.seeded} house recipes`,
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Couldn't update", description: e?.message });
    } finally {
      setSeeding(false);
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
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => seed(false)} disabled={seeding} className="gap-2 rounded-2xl">
              {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sprout className="h-4 w-4" />}
              House recipes
            </Button>
            <Button variant="outline" onClick={rebuild} disabled={rebuilding} className="gap-2 rounded-2xl">
              {rebuilding ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Rebuild board
            </Button>
          </div>
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
                  </div>
                  <Switch checked={g.isActive} onCheckedChange={(v) => toggleGame(g.id, v)} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

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
              <TabsList className="grid grid-cols-4 rounded-2xl">
                {STATUSES.map((s) => (
                  <TabsTrigger key={s} value={s} className="capitalize">
                    {s}
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
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {r.featured && <Badge className="rounded-xl bg-amber-500">Pick</Badge>}
                      {r.hasFreeText ? (
                        <Badge variant="secondary" className="rounded-xl">Own words</Badge>
                      ) : (
                        <Badge variant="outline" className="rounded-xl">Menu only</Badge>
                      )}
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
                    {r.status !== "published" && (
                      <Button size="sm" className="rounded-xl gap-1" disabled={busyId === r.id}
                        onClick={() => moderate(r.id, "approve")}>
                        <Check className="h-4 w-4" /> Approve
                      </Button>
                    )}
                    {r.status === "published" && (
                      <Button size="sm" variant="outline" className="rounded-xl gap-1" disabled={busyId === r.id}
                        onClick={() => moderate(r.id, "hide")}>
                        <EyeOff className="h-4 w-4" /> Hide
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
    </main>
  );
}
