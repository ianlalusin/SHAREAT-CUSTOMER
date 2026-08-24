"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { Loader2, Trophy } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NAME_MAX, type Leaderboard, type LeaderboardEntry } from "@/lib/games/flipit/leaderboard";

/** Their own name, so a regular does not retype it every round. */
const NAME_KEY = "shareat_flipit_name";

function rememberedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || "";
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------- the prompt --- */

/**
 * "Put me on the board" — shown once a round is finished.
 *
 * Deliberately opt-in and skippable in one tap. The round is already over and
 * the score is already on screen; this is a bonus, not a toll gate.
 */
export function ScorePrompt({
  scores,
  onPosted,
}: {
  scores: number[];
  onPosted: (board: Leaderboard, placed: boolean) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [canPost, setCanPost] = useState<boolean | null>(null);

  useEffect(() => {
    setName(rememberedName());
  }, []);

  /**
   * Only a phone at a table can post, so ask before offering it.
   *
   * The SERVER answers this, on the same route and the same token the submit
   * uses. Deciding it in the client from the token claims was a second
   * implementation of the rule that could — and did — disagree with the first:
   * it showed the name form to a browser with no session at all, because a
   * pending claims read leaves the answer unknown and unknown rendered as yes.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers: Record<string, string> = {};
        const user = getAuth().currentUser;
        if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;

        const res = await fetch("/api/customer/games/flipit/leaderboard", { headers, cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!cancelled) setCanPost(!!json?.canPost);
      } catch {
        if (!cancelled) setCanPost(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    setBusy(true);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Join your table to compete.");

      const res = await fetch("/api/customer/games/flipit/score", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ name, scores }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not save your score.");

      try {
        localStorage.setItem(NAME_KEY, name.trim());
      } catch {
        /* a remembered name is a convenience, never a requirement */
      }

      setDismissed(true);
      onPosted(json.board as Leaderboard, !!json.placed);
      toast({
        title: json.placed ? "You are on the board!" : "Score saved",
        description: json.placed ? "Grill better than that and you move up." : "Not a top-20 round this time.",
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not post that", description: e?.message ?? "Please try again." });
    } finally {
      setBusy(false);
    }
  };

  if (dismissed) return null;

  // Still asking. Showing nothing for a beat beats offering a form that is
  // about to be replaced by a refusal.
  if (canPost === null) return null;

  if (!canPost) {
    return (
      <p className="mt-3 rounded-2xl bg-zinc-100 px-4 py-3 text-center text-sm text-muted-foreground">
        Join your table to put your name on the board.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border bg-white p-3 shadow-sm">
      <p className="text-center text-sm font-bold">Put your name on the board?</p>
      <div className="mt-2 flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
          placeholder="Your name"
          maxLength={NAME_MAX}
          className="h-11 rounded-xl"
          aria-label="Name for the leaderboard"
        />
        <Button
          className="h-11 shrink-0 rounded-xl px-4 font-bold"
          disabled={busy || name.trim().length < 2}
          onClick={submit}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
        </Button>
      </div>
      <button
        type="button"
        className="mt-2 w-full text-center text-xs text-muted-foreground underline"
        onClick={() => setDismissed(true)}
      >
        No thanks
      </button>
    </div>
  );
}

/* -------------------------------------------------------------- the board --- */

export function LeaderboardSheet({
  open,
  onClose,
  board,
  highlightName,
}: {
  open: boolean;
  onClose: () => void;
  /** Passed in after posting so the board shown is the one just written. */
  board: Leaderboard | null;
  highlightName?: string;
}) {
  const isMobile = useIsMobile();
  const [fetched, setFetched] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const headers: Record<string, string> = {};
      const user = getAuth().currentUser;
      if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;

      const res = await fetch("/api/customer/games/flipit/leaderboard", { headers, cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error("Could not load the board.");
      setFetched(json.board as Leaderboard);
    } catch (e: any) {
      setError(e?.message || "Could not load the board.");
    }
  }, []);

  useEffect(() => {
    if (open && !board) load();
  }, [open, board, load]);

  const shown = board || fetched;

  const body = error ? (
    <p className="py-10 text-center text-sm text-destructive">{error}</p>
  ) : !shown ? (
    <div className="flex justify-center py-14">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
    </div>
  ) : (
    <Tabs defaultValue="today">
      <TabsList className="grid w-full grid-cols-2 rounded-2xl">
        <TabsTrigger value="today">Today</TabsTrigger>
        <TabsTrigger value="alltime">All time</TabsTrigger>
      </TabsList>
      <TabsContent value="today" className="mt-4">
        <Rows entries={shown.today.entries} highlightName={highlightName} empty="Nobody has posted a score today. Be first." />
      </TabsContent>
      <TabsContent value="alltime" className="mt-4">
        <Rows entries={shown.allTime} highlightName={highlightName} empty="No scores yet." />
      </TabsContent>
    </Tabs>
  );

  const title = "Grill Masters";
  const subtitle = "Best average across five strips. One row per player.";

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{subtitle}</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

function Rows({
  entries,
  empty,
  highlightName,
}: {
  entries: LeaderboardEntry[];
  empty: string;
  highlightName?: string;
}) {
  if (entries.length === 0) {
    return (
      <div className="py-12 text-center">
        <Trophy className="mx-auto h-9 w-9 text-zinc-300" />
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      </div>
    );
  }

  return (
    <ol className="space-y-1.5">
      {entries.map((e, i) => {
        const mine = !!highlightName && e.name === highlightName;
        return (
          <li
            key={`${e.key}-${i}`}
            className={`flex items-center gap-3 rounded-2xl border p-3 ${mine ? "border-primary bg-primary/5" : "bg-white"}`}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black ${
                i === 0 ? "bg-amber-400 text-amber-950" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{e.name}</span>
              {e.storeName && <span className="block truncate text-xs text-muted-foreground">{e.storeName}</span>}
            </span>
            <span className="shrink-0 text-lg font-black tabular-nums">{e.score}</span>
          </li>
        );
      })}
    </ol>
  );
}
