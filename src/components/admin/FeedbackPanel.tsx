"use client";

import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { Loader2, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * One branch's diner feedback.
 *
 * Rendered by both `/admin/feedback` and `/manager/feedback`. It takes the
 * branch as a prop and owns no auth or store-selection state of its own — the
 * shell resolved that once, and a screen that re-derives it is how two copies
 * of the same page end up disagreeing.
 */

export type FeedbackRow = {
  id: string;
  storeId: string;
  dayDocId: string;
  createdAtClientMs: number;
  customerName?: string;
  rating: number;
  suggestion?: string;
};

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
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

export function FeedbackPanel({ storeId, storeName }: { storeId: string; storeName: string }) {
  const [starFilter, setStarFilter] = useState("all");
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const user = getAuth().currentUser;
        if (!user) throw new Error("Not signed in.");

        const qs = new URLSearchParams({ storeId, rating: starFilter, limit: "500" });
        const res = await fetch(`/api/admin/feedback?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;

        // Say why rather than showing an empty list: "no feedback" and "you may
        // not read this branch" look identical otherwise.
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load feedback.");
        setRows(Array.isArray(json.rows) ? json.rows : []);
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          setError(e?.message || "Could not load feedback.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storeId, starFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {storeName} · {rows.length} {rows.length === 1 ? "response" : "responses"}
        </div>

        <div className="flex items-center gap-2">
          <select
            className="h-11 rounded-xl border bg-background px-3 text-sm"
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
            className="h-11 rounded-xl"
            disabled={rows.length === 0}
            onClick={() => {
              const name = String(storeName || storeId || "feedback").replace(/[^a-zA-Z0-9._-]/g, "_");
              downloadCsv(`feedback_${name}_${starFilter}.csv`, rows);
            }}
          >
            Download Excel
          </Button>
        </div>
      </div>

      {error ? (
        <p className="py-10 text-center text-sm text-destructive">{error}</p>
      ) : loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-400">No feedback for this branch yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rows.map((f) => (
            <div key={f.id} className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-black">{f.customerName || "A diner"}</div>
                  <div className="text-xs text-zinc-500">{fmt(f.createdAtClientMs)}</div>
                </div>
                <Stars value={f.rating} />
              </div>
              <div className="mt-3 whitespace-pre-wrap text-sm text-zinc-800">
                {f.suggestion || <span className="text-zinc-400">No suggestion.</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
