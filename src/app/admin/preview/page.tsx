"use client";

import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Eye, Loader2 } from "lucide-react";
import { PreviewDashboard } from "@/components/admin/preview/PreviewDashboard";

export default function PreviewPage() {
  const router = useRouter();

  const [authReady, setAuthReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  const [storeId, setStoreId] = useState("");
  const [stores, setStores] = useState<{ storeId: string; name: string }[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);

  // Auth guard + store list — same pattern as /admin/flash-ads.
  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthReady(true);
      if (!user) {
        setIsAuthed(false);
        router.replace("/admin/login");
        return;
      }
      setIsAuthed(true);

      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/admin/my-stores", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json();
        const list: { storeId: string; name: string }[] = Array.isArray(data?.stores) ? data.stores : [];
        setStores(list.map((x: any) => ({ storeId: String(x.storeId || ""), name: String(x.name || x.storeId || "") })));

        const ids = list.map((x) => x.storeId).filter(Boolean);
        let selected = "";
        try { selected = localStorage.getItem("admin_selected_storeId") || ""; } catch {}
        if (!selected || !ids.includes(selected)) selected = ids[0] || "";
        if (selected) {
          try { localStorage.setItem("admin_selected_storeId", selected); } catch {}
          setStoreId(selected);
        }
      } catch {}
      setLoadingStores(false);
    });
    return () => unsub();
  }, [router]);

  function handleStoreChange(id: string) {
    setStoreId(id);
    try { localStorage.setItem("admin_selected_storeId", id); } catch {}
  }

  const selectedStoreName = stores.find((s) => s.storeId === storeId)?.name || storeId;

  if (!authReady || loadingStores) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-[520px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/admin")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Eye className="h-6 w-6" /> Preview
          </h1>
          <p className="text-sm text-zinc-500 font-medium">See exactly what a customer sees, with mock data — read only.</p>
        </div>
      </div>

      {stores.length > 1 && (
        <Select value={storeId} onValueChange={handleStoreChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select store" />
          </SelectTrigger>
          <SelectContent>
            {stores.map((s) => (
              <SelectItem key={s.storeId} value={s.storeId}>
                {s.name || s.storeId}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {stores.length === 1 && (
        <p className="text-sm text-zinc-500">Store: <b>{selectedStoreName}</b></p>
      )}

      {stores.length === 0 && (
        <p className="text-sm text-zinc-400">No stores assigned.</p>
      )}

      {storeId && <PreviewDashboard storeId={storeId} storeName={selectedStoreName} />}
    </main>
  );
}
