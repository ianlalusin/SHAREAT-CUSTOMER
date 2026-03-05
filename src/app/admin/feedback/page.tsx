"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { ArrowLeft, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getStoreName } from "@/lib/store-directory";
import { useFirebase } from "@/firebase";

type FeedbackRow = {
  id: string;
  storeId: string;
  dayDocId: string;
  createdAtClientMs: number;
  customerName?: string;
  rating: number;
  suggestion?: string;
};

function Stars({ value }: { value: number }) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <div className="flex items-center gap-1">
      {stars.map((n) => (
        <Star
          key={n}
          className={cn("h-4 w-4", n <= value ? "fill-yellow-400 text-yellow-400" : "fill-white text-zinc-300")}
        />
      ))}
    </div>
  );
}

function fmt(ms: number) {
  if (!ms) return "-";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

function downloadCsv(filename: string, rows: Record<string, any>[]) {
  const headers = ["storeId", "dayDocId", "createdAtClientMs", "rating", "customerName", "suggestion"];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = r[h];
          const x = v === null || v === undefined ? "" : String(v);
          if (/[",\n]/.test(x)) return '"' + x.replace(/"/g, '""') + '"';
          return x;
        })
        .join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AdminFeedbackPage() {
  const router = useRouter();
  const { firestore } = useFirebase();

  const [authReady, setAuthReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  const [storeId, setStoreId] = useState<string>("");
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [stores, setStores] = useState<{ storeId: string; name: string }[]>([]);

  const [starFilter, setStarFilter] = useState<string>("all");
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try { setStoreId(localStorage.getItem("admin_selected_storeId") || ""); } catch {}
  }, []);

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
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray((data as any)?.stores) ? (data as any).stores : [];
        const ids = list.map((x: any) => String(x.storeId || "")).filter(Boolean);
        setStores(list.map((x: any) => ({ storeId: String(x.storeId || ""), name: String(x.name || x.storeId || "") })));
        setStoreIds(ids);

        let selected = "";
        try { selected = localStorage.getItem("admin_selected_storeId") || ""; } catch {}
        if (!selected || (ids.length > 0 && !ids.includes(selected))) selected = ids[0] || "";
        if (selected) {
          try { localStorage.setItem("admin_selected_storeId", selected); } catch {}
          setStoreId(selected);
        }
      } catch {}
    });
    return () => unsub();
  }, [router, firestore]);

  useEffect(() => {
    if (!authReady || !isAuthed) return;
    if (!storeId) return;

    let cancelled = false;

    async function run() {
      setIsLoading(true);
      const user = getAuth().currentUser;
      if (!user) {
        router.replace("/admin/login");
        return;
      }

      const idToken = await user.getIdToken();
      const qs = new URLSearchParams({
        storeId,
        rating: starFilter,
        limit: "500",
      });

      const res = await fetch(`/api/admin/feedback?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = await res.json().catch(() => ({}));

      if (!cancelled) {
        if (res.ok && (json as any)?.ok && Array.isArray((json as any).rows)) {
          setRows((json as any).rows as FeedbackRow[]);
        } else {
          setRows([]);
        }
        setIsLoading(false);
      }
    }

    run().catch(() => {
      if (!cancelled) {
        setRows([]);
        setIsLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [authReady, isAuthed, router, storeId, starFilter]);

  const selectedStoreName = useMemo(() => {
    return stores.find((s) => s.storeId === storeId)?.name || getStoreName(storeId) || storeId || "Store -";
  }, [stores, storeId]);

  return (
    <main className="min-h-screen p-6 max-w-[980px] mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => { if (window.history.length > 1) router.back(); else router.push("/admin"); }}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <h1 className="text-2xl font-bold">Admin Hub</h1>

          <div className="ml-2">
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm max-w-[220px]"
              value={storeId}
              onChange={(e) => {
                const v = e.target.value;
                setStoreId(v);
                try { localStorage.setItem("admin_selected_storeId", v); } catch {}
              }}
              disabled={stores.length <= 1}
              aria-label="Select store"
            >
              {stores.length === 0 ? (
                <option value="">No store assigned</option>
              ) : (
                stores.map((s) => (
                  <option key={s.storeId} value={s.storeId}>{s.name}</option>
                ))
              )}
            </select>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={async () => {
            try { await signOut(getAuth()); } catch {}
            router.push("/");
          }}
        >
          Exit Admin
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {selectedStoreName} | Feedbacks
        </div>

        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={starFilter}
            onChange={(e) => setStarFilter(e.target.value)}
            aria-label="Filter by stars"
          >
            <option value="all">All stars</option>
            <option value="5">5 stars</option>
            <option value="4">4 stars</option>
            <option value="3">3 stars</option>
            <option value="2">2 stars</option>
            <option value="1">1 star</option>
          </select>

          <Button
            variant="outline"
            onClick={() => {
                const name = (selectedStoreName || storeId || "feedback").toString().replace(/[^a-zA-Z0-9._-]/g, "_");
                const star = starFilter === "all" ? "all" : starFilter;
                downloadCsv(`feedback_${name}_${star}.csv`, rows);
              }}
          >
            Download Excel
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-zinc-500">Loading feedbacks...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((f) => (
            <div key={f.id} className="rounded-2xl bg-white shadow-sm border border-zinc-100 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-black">{getStoreName(f.storeId) || f.storeId}</div>
                  <div className="text-xs text-zinc-500">{fmt(f.createdAtClientMs)}</div>
                </div>
                <Stars value={f.rating} />
              </div>

              <div className="mt-3 text-sm text-zinc-800 whitespace-pre-wrap">
                {f.suggestion || <span className="text-zinc-400">No suggestion.</span>}
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="text-sm text-zinc-400">No feedbacks found.</div>
          )}
        </div>
      )}
    </main>
  );
}
