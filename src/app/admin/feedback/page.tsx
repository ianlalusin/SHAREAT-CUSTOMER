"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";

import { DashboardHeader } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FeedbackDTO = {
  id: string;
  createdAt: string; // ISO for now
  storeId?: string;
  storeName?: string;
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

export default function AdminFeedbackPage() {
  const [starFilter, setStarFilter] = useState<string>("all");

  // TODO: replace with backend fetch
  const data: FeedbackDTO[] = useMemo(
    () => [
      { id: "demo1", createdAt: new Date().toISOString(), storeName: "SharEat Lipa", customerName: "Customer", rating: 4, suggestion: "More side dish options." },
      { id: "demo2", createdAt: new Date().toISOString(), storeName: "SharEat Malvar", customerName: "Customer", rating: 5, suggestion: "Solid service!" },
    ],
    []
  );

  const filtered = useMemo(() => {
    if (starFilter === "all") return data;
    const n = Number(starFilter);
    return data.filter((x) => x.rating === n);
  }, [data, starFilter]);

  return (
    <main className="min-h-screen pb-16 flex flex-col bg-zinc-50">
      <DashboardHeader customerName="Admin" tableDisplayName="Feedback" packageName="Customer Feedbacks" />

      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 mt-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 justify-between">
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

          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/admin">Back</Link>
            </Button>
            <Button
              className="bg-primary text-white"
              onClick={() => {
                // TODO: download excel
                alert("Download Excel: TODO");
              }}
            >
              Download Excel
            </Button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((f) => (
            <div key={f.id} className="rounded-2xl bg-white shadow-sm border border-zinc-100 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-black">{f.storeName || f.storeId || "Store -"}</div>
                  <div className="text-xs text-zinc-500">{new Date(f.createdAt).toLocaleString()}</div>
                </div>
                <Stars value={f.rating} />
              </div>

              <div className="mt-3 text-sm text-zinc-800 whitespace-pre-wrap">
                {f.suggestion || <span className="text-zinc-400">No suggestion.</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
