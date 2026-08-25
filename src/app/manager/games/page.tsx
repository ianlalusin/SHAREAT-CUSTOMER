"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { Gamepad2, Loader2, Lock } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ManagerHeader } from "@/components/admin/ManagerHeader";
import { useStoreScope } from "@/components/admin/StoreScope";

type Row = {
  id: string;
  title: string;
  tagline: string;
  configured: boolean;
  runningHere: boolean;
  lockedReason: string | null;
};

/**
 * Games, for one branch.
 *
 * The switch here is subtractive — it adds or removes this branch in the
 * game's `disabledStoreIds` and nothing else. A game head office has switched
 * off everywhere, or not offered here, shows the switch DISABLED with the
 * reason next to it, rather than a control that quietly does nothing.
 */
export default function ManagerGamesPage() {
  const { storeId, storeName } = useStoreScope();
  const { toast } = useToast();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const authed = useCallback(async () => {
    const user = getAuth().currentUser;
    if (!user) throw new Error("Not signed in.");
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  }, []);

  const load = useCallback(async () => {
    if (!storeId) return;
    setError(null);
    try {
      const res = await fetch(`/api/manager/games?storeId=${encodeURIComponent(storeId)}`, {
        headers: await authed(),
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load games.");
      setRows(json.games as Row[]);
    } catch (e: any) {
      setRows([]);
      setError(e?.message || "Could not load games.");
    }
  }, [storeId, authed]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  const toggle = async (row: Row, next: boolean) => {
    setBusyId(row.id);
    try {
      const res = await fetch("/api/manager/games", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(await authed()) },
        body: JSON.stringify({ storeId, gameId: row.id, enabled: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not change that.");

      setRows((rs) => (rs ? rs.map((r) => (r.id === row.id ? { ...r, runningHere: next } : r)) : rs));
      toast({
        title: next ? "Switched on here" : "Switched off here",
        description: `${row.title} at ${storeName}.`,
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not change that", description: e?.message });
      load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-[560px] space-y-6 p-6">
      <ManagerHeader
        title="Games"
        subtitle="On or off for this branch only. Other branches are unaffected."
        icon={<Gamepad2 className="h-6 w-6" />}
      />

      {error ? (
        <p className="py-10 text-center text-sm text-destructive">{error}</p>
      ) : rows === null ? (
        <div className="flex justify-center py-14">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="flex items-start gap-4 rounded-2xl bg-white p-4 shadow-sm">
              <div className="min-w-0 flex-1">
                <p className="font-black leading-tight">{r.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{r.tagline}</p>
                {r.lockedReason && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    {r.lockedReason}
                  </p>
                )}
              </div>
              <Switch
                checked={r.runningHere}
                disabled={!!r.lockedReason || busyId === r.id}
                onCheckedChange={(v) => toggle(r, v)}
                aria-label={`${r.title} at this branch`}
              />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
