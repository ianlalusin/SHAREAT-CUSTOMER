"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
type PinRow = {
  pin: string;
  storeId: string;
  status: string;
  tableDisplayName: string;
  customerName: string;
  expiresAtMs: number;
  archivedAtMs: number;
};

function fmt(ms: number) {
  if (!ms) return "-";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

/**
 * One branch's table PINs, with cleanup.
 *
 * Shared by `/admin/pins` and `/manager/pins`. Everything goes through the
 * Admin-SDK routes rather than the client SDK, and it has to: the live rules
 * declare `pinRegistry` as `create, update, delete: if false` for everyone, so
 * the old per-row delete button on the admin hub could never have worked, and
 * an unfiltered list of the collection is refused for anyone but an admin.
 */
export function PinsPanel({ storeId, storeName }: { storeId: string; storeName: string }) {
  const { toast } = useToast();

  const [status, setStatus] = useState<"active" | "archived">("active");
  const [rows, setRows] = useState<PinRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const authed = useCallback(async () => {
    const user = getAuth().currentUser;
    if (!user) throw new Error("Not signed in.");
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  }, []);

  const load = useCallback(async () => {
    if (!storeId) return;
    setError(null);
    try {
      const qs = new URLSearchParams({ storeId, status });
      const res = await fetch(`/api/manager/pins?${qs}`, { headers: await authed(), cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load PINs.");
      setRows(json.rows as PinRow[]);
    } catch (e: any) {
      setRows([]);
      setError(e?.message || "Could not load PINs.");
    }
  }, [storeId, status, authed]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  const removePin = async (row: PinRow) => {
    setBusy(row.pin);
    try {
      const res = await fetch("/api/manager/pins", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(await authed()) },
        body: JSON.stringify({ storeId, pin: row.pin }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not delete that PIN.");
      setRows((rs) => (rs ? rs.filter((r) => r.pin !== row.pin) : rs));
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not delete that", description: e?.message });
    } finally {
      setBusy(null);
    }
  };

  const cleanup = async () => {
    setBusy("cleanup");
    try {
      const res = await fetch("/api/manager/pins/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authed()) },
        body: JSON.stringify({ storeId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Cleanup failed.");
      toast({
        title: json.deletedCount ? `Cleared ${json.deletedCount}` : "Nothing to clear",
        description: json.deletedCount
          ? `Finished PINs removed from ${storeName}.`
          : "No finished PINs older than 6 hours.",
      });
      load();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Cleanup failed", description: e?.message });
    } finally {
      setBusy(null);
    }
  };

  const now = Date.now();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={status} onValueChange={(v) => setStatus(v as "active" | "archived")}>
          <TabsList className="rounded-2xl">
            <TabsTrigger value="active" className="px-5 py-2">
              Active
            </TabsTrigger>
            <TabsTrigger value="archived" className="px-5 py-2">
              Finished
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {status === "archived" && (
          <Button
            variant="outline"
            className="h-11 gap-2 rounded-xl"
            disabled={busy === "cleanup"}
            onClick={cleanup}
          >
            {busy === "cleanup" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Clear finished
          </Button>
        )}
      </div>

      {error ? (
        <p className="py-10 text-center text-sm text-destructive">{error}</p>
      ) : rows === null ? (
        <div className="flex justify-center py-14">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-14 text-center text-sm text-zinc-400">
          {status === "active" ? "No PINs issued at this branch right now." : "Nothing finished to clear."}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const expired = r.expiresAtMs > 0 && r.expiresAtMs <= now;
            return (
              <div key={r.pin} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
                <span className="shrink-0 rounded-xl bg-zinc-100 px-3 py-2 font-mono text-lg font-black tracking-widest">
                  {r.pin}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold leading-tight">{r.tableDisplayName || "Table"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.customerName || "No name"} ·{" "}
                    {status === "archived" ? `finished ${fmt(r.archivedAtMs)}` : expired ? "expired" : `until ${fmt(r.expiresAtMs)}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 shrink-0 text-muted-foreground"
                  aria-label={`Delete PIN ${r.pin}`}
                  disabled={busy === r.pin || (status === "active" && !expired)}
                  onClick={() => removePin(r)}
                >
                  {busy === r.pin ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
