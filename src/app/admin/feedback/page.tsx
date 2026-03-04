"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { getAuth, onAuthStateChanged } from "firebase/auth";

import { DashboardHeader } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getStoreName } from "@/lib/store-directory";
import { useFirebase } from "@/firebase";
import { useRouter } from "next/navigation";

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

  // restore persisted storeId early
  useEffect(() => {
    try {
      setStoreId(localStorage.getItem("admin_selected_storeId") || "");
    } catch {}
  }, []);

  // auth + assigned stores
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
        try {
          selected = localStorage.getItem("admin_selected_storeId") || "";
        } catch {}

        if (!selected || (ids.length > 0 && !ids.includes(selected))) selected = ids[0] || "";
        if (selected) {
          try {
            localStorage.setItem("admin_selected_storeId", selected);
          } catch {}
          setStoreId(selected);
        }
      } catch {}
    });
    return () => unsub();
  }, [router, firestore]);

  // fetch feedback rows
  useEffect(() => {
    if (!authReady || !isAuthed) return;
    if (!storeId) return;

    let cancelled = false;

    async function run() {
      setIsLoading(true);
      const auth = getAuth();
      const user = auth.currentUser;
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

      const url = `/api/admin/feedback?${qs.toString()}`;
      console.log("[feedback] storeId=", storeId, "rating=", starFilter, "url=", url);
      const res = await fetch(url, {
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

    return () => {
      cancelled = true;
    };
  }, [authReady, isAuthed, router, storeId, starFilter]);

  const selectedStoreName = useMemo(() => {
    return stores.find((s) => s.storeId === storeId)?.name || getStoreName(storeId) || storeId || "Store -";
  }, [stores, storeId]);

  return (
    <main className="min-h-screen pb-16 flex flex-col bg-zinc-50">
      <DashboardHeader customerName="Admin" tableDisplayName={selectedStoreName} packageName="Customer Feedbacks" />

      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 mt-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold">Store</label>
              <select
                className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm"
                value={storeId}
                onChange={(e) => {
                  const v = e.target.value;
                  setStoreId(v);
                  try { localStorage.setItem("admin_selected_storeId", v); } catch {}
                }}
              >
                {storeIds.map((id) => (
                  <option key={id} value={id}>
                    {stores.find((s) => s.storeId === id)?.name || getStoreName(id) || id}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold">Filter by stars</label>
              <select
                className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm"
                value={starFilter}
                onChange={(e) => setStarFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="5">5 stars</option>
                <option value="4">4 stars</option>
                <option value="3">3 stars</option>
                <option value="2">2 stars</option>
                <option value="1">1 star</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/admin">Back</Link>
            </Button>
            <Button
              className="bg-primary text-white"
              onClick={() => {
                alert("Download Excel: TODO");
              }}
            >
              Download Excel
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-10 text-sm text-zinc-500">Loading feedbacks...</div>
        ) : (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
      </div>
    </main>
  );
}
