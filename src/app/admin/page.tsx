"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, orderBy, query, limit, deleteDoc, doc } from "firebase/firestore";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, LogOut, RefreshCw, MessageSquare, Megaphone, Trash2 } from "lucide-react";

type PinRow = {
  id: string; // PIN itself (doc id)
  storeId?: string;
  sessionId?: string;
  status?: string;
  expiresAtMs?: number;
  archivedAtMs?: number;
};

function fmtDate(ms?: number) {
  if (!ms) return "-";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

export default function AdminHomePage() {
  const router = useRouter();
  const { firestore } = useFirebase();
  const { toast } = useToast();

  const [authReady, setAuthReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  const [pins, setPins] = useState<PinRow[]>([]);
  const [isLoadingPins, setIsLoadingPins] = useState(true);
  const [isCleaningPins, setIsCleaningPins] = useState(false);
  const [deletingPin, setDeletingPin] = useState<string | null>(null);
  const [storeNames, setStoreNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthReady(true);
      if (!user) {
        setIsAuthed(false);
        router.replace("/admin/login");
        return;
      }
      setIsAuthed(true);
    });
    return () => unsub();
  }, [router]);

  // Fetch store names from Firestore via API
  useEffect(() => {
    if (!authReady || !isAuthed) return;
    (async () => {
      try {
        const user = getAuth().currentUser;
        if (!user) return;
        const idToken = await user.getIdToken();
        const res = await fetch("/api/admin/my-stores", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json().catch(() => ({}));
        const list: { storeId: string; name: string }[] = Array.isArray(data?.stores) ? data.stores : [];
        const map: Record<string, string> = {};
        for (const s of list) {
          if (s.storeId) map[s.storeId] = s.name || s.storeId;
        }
        setStoreNames(map);
      } catch {}
    })();
  }, [authReady, isAuthed]);

  const now = Date.now();

  const activeCount = useMemo(() => {
    return pins.filter((p) => (p.status === "active") && (p.expiresAtMs ?? 0) > now).length;
  }, [pins, now]);

  const archivedCount = useMemo(() => {
    return pins.filter((p) => p.status === "archived").length;
  }, [pins]);

  const expiredCount = useMemo(() => pins.length - activeCount - archivedCount, [pins.length, activeCount, archivedCount]);

  useEffect(() => {
    if (!authReady || !isAuthed) return;

    setIsLoadingPins(true);

    // Show latest 200 pins (enough for admin table)
    const q = query(collection(firestore, "pinRegistry"), orderBy("expiresAtMs", "desc"), limit(200));

    return onSnapshot(
      q,
      (snap) => {
        const list: PinRow[] = snap.docs.map((d) => {
          const x = d.data() as any;
          return {
            id: d.id,
            storeId: x.storeId,
            sessionId: x.sessionId,
            status: x.status,
            expiresAtMs: Number(x.expiresAtMs || 0),
            archivedAtMs: x.archivedAtMs ? Number(x.archivedAtMs) : undefined,
          };
        });
        setPins(list);
        setIsLoadingPins(false);
      },
      () => {
        setPins([]);
        setIsLoadingPins(false);
      }
    );
  }, [authReady, isAuthed, firestore]);

  async function cleanupArchivedPins() {
    setIsCleaningPins(true);
    try {
      const user = getAuth().currentUser;
      if (!user) {
        toast({ title: "Not signed in", description: "Please sign in again.", variant: "destructive" });
        return;
      }
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/cleanup-archived-pins", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        toast({
          title: "Cleanup failed",
          description: json?.error ?? "Could not clean archived pins.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Cleanup complete",
        description: `Deleted ${Number(json?.deletedCount || 0)} archived pin(s).`,
      });
    } catch (e: any) {
      toast({
        title: "Cleanup failed",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsCleaningPins(false);
    }
  }

  async function removePin(pinId: string) {
    if (!window.confirm(`Delete PIN ${pinId}?`)) return;
    setDeletingPin(pinId);
    try {
      await deleteDoc(doc(firestore, "pinRegistry", pinId));
      toast({ title: "PIN deleted" });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message ?? "Check rules.", variant: "destructive" });
    } finally {
      setDeletingPin(null);
    }
  }

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-[1100px] mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Admin</h1>
          <p className="text-sm text-zinc-500 font-medium">Catalog + PIN monitoring</p>
        </div>

        <Button
          variant="outline"
          onClick={async () => {
            try { await signOut(getAuth()); } catch {}
            router.push("/");
          }}
          className="gap-2"
        >
          <LogOut className="h-4 w-4" />
          Exit
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Button
          onClick={() => router.push("/admin/feedback")}
          variant="outline"
          className="h-16 rounded-2xl font-black text-lg gap-3"
        >
          <MessageSquare className="h-5 w-5" />
          Feedbacks
        </Button>

        <Button
          onClick={() => router.push("/admin/flash-ads")}
          variant="outline"
          className="h-16 rounded-2xl font-black text-lg gap-3"
        >
          <Megaphone className="h-5 w-5" />
          Flash Ads
        </Button>
      </div>

      <Card className="rounded-[2rem] border-none shadow-xl overflow-hidden bg-white">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl font-black">PIN Registry</CardTitle>
            <div className="flex items-center gap-2">
              <Badge className="rounded-xl" variant="default">Active: {activeCount}</Badge>
              <Badge className="rounded-xl" variant="outline">Archived: {archivedCount}</Badge>
              <Badge className="rounded-xl" variant="secondary">Expired: {expiredCount}</Badge>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={cleanupArchivedPins}
              disabled={isCleaningPins}
              className="gap-2"
            >
              {isCleaningPins ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Cleanup Archived
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => router.refresh()}
              aria-label="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoadingPins ? (
            <div className="p-10 flex items-center justify-center gap-2 text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading pins...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-zinc-600">
                  <tr>
                    <th className="text-left px-5 py-3 font-black">PIN</th>
                    <th className="text-left px-5 py-3 font-black">Store</th>
                    <th className="text-left px-5 py-3 font-black">Session</th>
                    <th className="text-left px-5 py-3 font-black">Status</th>
                    <th className="text-left px-5 py-3 font-black">Expires</th>
                    <th className="text-right px-5 py-3 font-black">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pins.map((p) => {
                    const isArchived = p.status === "archived";
                    const expired = !isArchived && (p.expiresAtMs ?? 0) <= Date.now();
                    const isActive = p.status === "active" && !expired;
                    const statusLabel = isArchived ? "ARCHIVED" : isActive ? "ACTIVE" : "EXPIRED";
                    const statusVariant = isArchived ? "outline" : isActive ? "default" : "secondary";
                    return (
                      <tr key={p.id} className="hover:bg-zinc-50/60">
                        <td className="px-5 py-3 font-black tracking-widest">{p.id}</td>
                        <td className="px-5 py-3">{(p.storeId && storeNames[p.storeId]) || p.storeId || "-"}</td>
                        <td className="px-5 py-3">{p.sessionId || "-"}</td>
                        <td className="px-5 py-3">
                          <Badge className="rounded-xl" variant={statusVariant as any}>
                            {statusLabel}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-zinc-500">{fmtDate(p.expiresAtMs)}</td>
                        <td className="px-5 py-3 text-right">
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => removePin(p.id)}
                            disabled={deletingPin === p.id}
                            aria-label={`Delete PIN ${p.id}`}
                          >
                            {deletingPin === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {pins.length === 0 && (
                    <tr>
                      <td className="px-5 py-10 text-center text-zinc-400" colSpan={6}>
                        No pins found in pinRegistry.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

    </main>
  );
}