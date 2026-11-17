"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { CheckCircle2, Gift, KeyRound, Loader2, Lock, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ManagerHeader } from "@/components/admin/ManagerHeader";
import { useStoreScope } from "@/components/admin/StoreScope";

type Winner = {
  catchId: string;
  status: "won" | "claimed";
  prizeName: string;
  code: string;
  tableDisplayName: string;
  wonAtMs: number;
  claimedAtMs: number | null;
  locked: boolean;
  claimedBy: string | null;
};
type Prize = { id: string; name: string; perDay: number; given: number };

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });

/**
 * The seasonal hunt at one branch: set the cashier PIN, see today's winners.
 *
 * The cashier types the PIN on the diner's phone when handing a prize over, so
 * pick one the cashiers know and diners don't — and change it if it leaks.
 */
export default function ManagerGhostHuntPage() {
  const { storeId, storeName } = useStoreScope();
  const { toast } = useToast();
  const [data, setData] = useState<{ day: string; hasPin: boolean; prizes: Prize[]; winners: Winner[] } | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const authed = useCallback(async () => {
    const user = getAuth().currentUser;
    if (!user) throw new Error("Not signed in.");
    return { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" };
  }, []);

  const load = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/manager/ghost-hunt?storeId=${encodeURIComponent(storeId)}`, {
        headers: await authed(),
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load.");
      setData(json);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Couldn't load", description: e?.message });
    }
  }, [storeId, authed, toast]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const savePin = async () => {
    setBusy("pin");
    try {
      const res = await fetch("/api/manager/ghost-hunt", {
        method: "PUT",
        headers: await authed(),
        body: JSON.stringify({ storeId, pin }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not save.");
      setPin("");
      toast({ title: "Cashier PIN saved", description: `For ${storeName}.` });
      load();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Couldn't save", description: e?.message });
    } finally {
      setBusy(null);
    }
  };

  const markGiven = async (w: Winner) => {
    setBusy(w.catchId);
    try {
      const res = await fetch("/api/manager/ghost-hunt", {
        method: "POST",
        headers: await authed(),
        body: JSON.stringify({ storeId, catchId: w.catchId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not update.");
      load();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Couldn't update", description: e?.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-[560px] space-y-6 p-6">
      <ManagerHeader title="Christmas Hunt" subtitle={`Prizes and cashier PIN for ${storeName}`} icon={<Gift className="h-6 w-6" />} />

      {data === null ? (
        <div className="flex justify-center py-14">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="flex items-center gap-2 font-black">
              <KeyRound className="h-4 w-4" /> Cashier PIN
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.hasPin
                ? "Set. Cashiers type it on the diner's phone when they hand the prize over. Change it any time."
                : "Not set yet — cashiers cannot confirm prizes until you set one."}
            </p>
            <div className="mt-3 flex gap-2">
              <Input
                inputMode="numeric"
                maxLength={6}
                placeholder="4–6 digits"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                className="rounded-2xl"
              />
              <Button onClick={savePin} disabled={pin.length < 4 || busy === "pin"} className="rounded-2xl">
                {busy === "pin" ? <Loader2 className="h-4 w-4 animate-spin" /> : data.hasPin ? "Change" : "Set PIN"}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="font-black">Today ({data.day})</p>
              <Button variant="ghost" size="icon" onClick={load} aria-label="Refresh">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {data.prizes.map((p) => (
                <div key={p.id} className="rounded-xl bg-zinc-50 px-3 py-2">
                  <p className="text-sm font-bold leading-tight">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.given} of {p.perDay} won
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {data.winners.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No winners yet today.</p>
            ) : (
              data.winners.map((w) => (
                <div key={w.catchId} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-black leading-tight">{w.prizeName}</p>
                    <p className="text-xs text-muted-foreground">
                      {w.tableDisplayName} · code <span className="font-mono font-bold">{w.code}</span> · won {time(w.wonAtMs)}
                    </p>
                    {w.locked && w.status === "won" && (
                      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700">
                        <Lock className="h-3 w-3" /> Locked after wrong PINs
                      </p>
                    )}
                  </div>
                  {w.status === "claimed" ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" /> Given {w.claimedAtMs ? time(w.claimedAtMs) : ""}
                    </span>
                  ) : (
                    <Button size="sm" onClick={() => markGiven(w)} disabled={busy === w.catchId} className="rounded-xl">
                      {busy === w.catchId ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mark given"}
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </main>
  );
}
