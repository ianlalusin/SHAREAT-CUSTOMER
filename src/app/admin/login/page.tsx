"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, orderBy, query, limit } from "firebase/firestore";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { useFirebase } from "@/firebase";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, LogOut, Package, KeyRound, RefreshCw } from "lucide-react";

type PinRow = {
  id: string; // PIN itself (doc id)
  storeId?: string;
  sessionId?: string;
  status?: string;
  expiresAtMs?: number;
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

  const [authReady, setAuthReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  const [pins, setPins] = useState<PinRow[]>([]);
  const [isLoadingPins, setIsLoadingPins] = useState(true);

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

  const now = Date.now();

  const activeCount = useMemo(() => {
    return pins.filter((p) => (p.status === "active") && (p.expiresAtMs ?? 0) > now).length;
  }, [pins, now]);

  const expiredCount = useMemo(() => pins.length - activeCount, [pins.length, activeCount]);

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
          onClick={() => router.push("/admin/items")}
          className="h-16 rounded-2xl font-black text-lg gap-3"
        >
          <Package className="h-5 w-5" />
          Manage Items
        </Button>

        <Button
          onClick={() => router.push("/admin/pins")}
          variant="outline"
          className="h-16 rounded-2xl font-black text-lg gap-3"
        >
          <KeyRound className="h-5 w-5" />
          Pins Page (soon)
        </Button>
      </div>

      <Card className="rounded-[2rem] border-none shadow-xl overflow-hidden bg-white">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl font-black">PIN Registry</CardTitle>
            <div className="flex items-center gap-2">
              <Badge className="rounded-xl" variant="default">Active: {activeCount}</Badge>
              <Badge className="rounded-xl" variant="secondary">Expired: {expiredCount}</Badge>
            </div>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={() => router.refresh()}
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
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
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pins.map((p) => {
                    const expired = (p.expiresAtMs ?? 0) <= Date.now();
                    const isActive = p.status === "active" && !expired;
                    return (
                      <tr key={p.id} className="hover:bg-zinc-50/60">
                        <td className="px-5 py-3 font-black tracking-widest">{p.id}</td>
                        <td className="px-5 py-3">{p.storeId || "-"}</td>
                        <td className="px-5 py-3">{p.sessionId || "-"}</td>
                        <td className="px-5 py-3">
                          <Badge className="rounded-xl" variant={isActive ? "default" : "secondary"}>
                            {isActive ? "ACTIVE" : "EXPIRED"}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-zinc-500">{fmtDate(p.expiresAtMs)}</td>
                      </tr>
                    );
                  })}
                  {pins.length === 0 && (
                    <tr>
                      <td className="px-5 py-10 text-center text-zinc-400" colSpan={5}>
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