"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard/Header";
import { FastRefills } from "@/components/dashboard/FastRefills";
import { ServiceActions } from "@/components/dashboard/ServiceActions";
import { RequestHistory, RequestRecord } from "@/components/dashboard/RequestHistory";
import { Loader2, History, UtensilsCrossed } from "lucide-react";

type LatestItem = {
  id: string;
  message?: string;
  status?: string;
  source?: string;
  table?: string;
  sessionId?: string;
  createdAt?: { _seconds?: number; _nanoseconds?: number };
};

function formatTimeFromFirestore(ts?: LatestItem["createdAt"]) {
  const sec = ts?._seconds;
  if (!sec) return "";
  const d = new Date(sec * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function DashboardPage() {
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const router = useRouter();
  const [customerName, setCustomerName] = useState("Customer");
  const [tableName, setTableName] = useState("B12");

  // Optional: allow /dashboard?table=T12
  const table = useMemo(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      return (sp.get("table") ?? "B12").trim() || "B12";
    } catch {
      return "B12";
    }
  }, []);

  useEffect(() => {
    // Check session cookie (your existing logic)
    const cookies = document.cookie.split(";");
    const sessionToken = cookies.find((c) => c.trim().startsWith("session_token="));

    if (!sessionToken) {
      router.push("/");
      return;
    }

    const timer = setTimeout(() => setIsLoaded(true), 400);
    return () => clearTimeout(timer);
  }, [router]);

  useEffect(() => {
    let alive = true;

    async function pull() {
      try {
        const res = await fetch("/api/customer/latest", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!alive) return;

        const items: LatestItem[] = Array.isArray(data?.items) ? data.items : [];
        const mapped: RequestRecord[] = items.map((it) => ({
          id: it.id,
          item: `${it.table ? `[${it.table}] ` : ""}${it.message ?? ""}`.trim(),
          timestamp: formatTimeFromFirestore(it.createdAt),
          status: (it.status as any) ?? "queued",
        }));

        setRequests(mapped);
      } catch {
        // ignore; keep last known list
      }
    }

    // initial + poll
    pull();
    const iv = setInterval(pull, 1500);

    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  const handleNewRequest = (_item: string) => {
    // No local simulation now.
    // ServiceActions/FastRefills already POST to /api/customer.
    // Poller will pick up the new entry.
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen pb-10 flex flex-col">
      <DashboardHeader customerName={customerName} tableName={tableName} />

      <div className="flex-1 bg-background">
        <FastRefills onRefillRequested={handleNewRequest} />

        <div className="px-6 py-2">
          <div className="h-px bg-zinc-200 w-full" />
        </div>

        <ServiceActions onServiceRequested={handleNewRequest} />

        <div className="px-6 py-2">
          <div className="h-px bg-zinc-200 w-full" />
        </div>

        <RequestHistory requests={requests} />
      </div>

      <nav className="fixed bottom-0 left-0 right-0 max-w-[500px] mx-auto bg-white/80 backdrop-blur-md border-t border-zinc-100 px-6 h-20 flex items-center justify-around z-50">
        <button className="flex flex-col items-center gap-1 text-primary">
          <div className="bg-primary/10 p-2 rounded-xl">
            <UtensilsCrossed className="h-6 w-6" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest">Home</span>
        </button>

        <button className="flex flex-col items-center gap-1 text-muted-foreground" onClick={() => {}}>
          <div className="p-2">
            <History className="h-6 w-6" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest">History</span>
        </button>
      </nav>
    </main>
  );
}
