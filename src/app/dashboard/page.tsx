"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Clock, History as HistoryIcon, Utensils } from "lucide-react";

import { DashboardHeader } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { CustomerRefillModal } from "@/components/customer/CustomerRefillModal";
import { FastRefills } from "@/components/dashboard/FastRefills";
import { ServiceActions } from "@/components/dashboard/ServiceActions";
import { useFirebase, useMemoFirebase, useCollection } from "@/firebase";
import { collection, orderBy, query, where } from "firebase/firestore";

function getCookie(name: string) {
  if (typeof document === 'undefined') return "";
  const c = document.cookie.split(";").map((v) => v.trim());
  return c.find((x) => x.startsWith(name + "="))?.split("=").slice(1).join("=") ?? "";
}

export default function DashboardPage() {
  const router = useRouter();
  const { firestore } = useFirebase();

  const [isLoaded, setIsLoaded] = useState(false);
  const [isRefillOpen, setIsRefillOpen] = useState(false);

  const sessionToken = useMemo(() => getCookie("session_token"), []);
  const tableName = useMemo(() => decodeURIComponent(getCookie("session_table") || "B12"), []);
  const customerName = useMemo(() => decodeURIComponent(getCookie("session_customer") || "Customer"), []);

  const storeId = useMemo(() => decodeURIComponent(getCookie("store_id") || ""), []);
  const sessionId = useMemo(() => decodeURIComponent(getCookie("session_id") || "mock_session"), []);
  const packageOfferingId = useMemo(() => decodeURIComponent(getCookie("package_offering_id") || ""), []);
  const initialFlavorIds = useMemo(() => {
    const raw = decodeURIComponent(getCookie("initial_flavor_ids") || "");
    return raw ? raw.split(",").filter(Boolean) : [];
  }, []);

  useEffect(() => {
    if (!sessionToken) {
      router.push("/");
      return;
    }
    const t = setTimeout(() => setIsLoaded(true), 250);
    return () => clearTimeout(t);
  }, [router, sessionToken]);

  const refillQuery = useMemoFirebase(() => {
    if (!firestore || !tableName) return null;
    const tId = tableName.startsWith("T") ? tableName : `T${tableName.replace(/\D/g, "")}`;
    return query(
      collection(firestore, "refillRequests"),
      where("tableId", "==", tId),
      orderBy("createdAt", "desc")
    );
  }, [firestore, tableName]);

  const { data: refills } = useCollection(refillQuery);

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  const session = {
    id: sessionId,
    storeId,
    tableId: tableName.startsWith("T") ? tableName : `T${tableName.replace(/\D/g, "")}`,
    tableDisplayName: `Table ${tableName.replace(/\D/g, "") || tableName}`,
    tableNumber: tableName.replace(/\D/g, "") || tableName,
    packageOfferingId,
    initialFlavorIds,
    sessionMode: "package_dinein",
    status: "active",
    packageSnapshot: { name: "" },
  };

  return (
    <main className="min-h-screen pb-20 flex flex-col bg-zinc-50">
      <DashboardHeader customerName={customerName} tableName={tableName} />

      <div className="container max-w-7xl mx-auto px-4 sm:px-8 -mt-12 sm:-mt-16 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Main Actions Area */}
          <div className="lg:col-span-8 space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <Button 
                className="h-28 sm:h-40 rounded-[2.5rem] text-xl sm:text-2xl font-black shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all bg-primary border-4 border-white/20"
                onClick={() => setIsRefillOpen(true)}
              >
                <Plus className="mr-3 h-8 w-8" />
                Order Refill
              </Button>
              <Button 
                className="h-28 sm:h-40 rounded-[2.5rem] text-xl sm:text-2xl font-black shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all bg-white text-zinc-900 border-4 border-zinc-100 hover:bg-zinc-50" 
                variant="outline" 
                onClick={() => router.push("/catalog")}
              >
                <Utensils className="mr-3 h-7 w-7 text-primary" />
                Browse Menu
              </Button>
            </div>

            <ServiceActions onServiceRequested={(a) => console.log(a)} />

            <FastRefills onRefillRequested={(it) => console.log(it)} />
          </div>

          {/* Sidebar Area - History */}
          <div className="lg:col-span-4 space-y-8">
            <Card className="rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white lg:sticky lg:top-28">
              <CardHeader className="bg-zinc-50/50 flex flex-row items-center justify-between border-b px-8 py-8">
                <div className="flex items-center gap-3">
                  <div className="bg-white p-2 rounded-2xl shadow-sm">
                    <HistoryIcon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl font-black tracking-tight">Activity Log</CardTitle>
                </div>
                <Badge variant="secondary" className="rounded-xl px-3 py-1 font-black bg-zinc-200 text-zinc-700">
                  {refills?.length || 0}
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-zinc-50 max-h-[60vh] lg:max-h-[70vh] overflow-y-auto custom-scrollbar">
                  {refills?.map((r) => (
                    <div key={r.id} className="p-8 hover:bg-zinc-50/50 transition-colors">
                      <div className="flex items-start justify-between mb-4">
                        <div className="font-black text-[10px] uppercase tracking-[0.2em] text-zinc-400">Request Status</div>
                        <Badge className="rounded-xl px-4 py-1.5 font-black text-[10px] shadow-sm" variant={r.status === "served" ? "secondary" : "default"}>
                          {r.status === "served" ? "SERVED" : "PREPARING"}
                        </Badge>
                      </div>

                      <div className="space-y-3">
                        {Array.isArray(r.items) && r.items.map((it: any, idx: number) => (
                          <div key={idx} className="flex flex-col bg-zinc-50 p-4 rounded-3xl border border-zinc-100 shadow-sm">
                            <div className="text-zinc-900 font-black text-lg">{it.refillName}</div>
                            {Array.isArray(it.flavorNames) && it.flavorNames.length ? (
                              <div className="text-xs mt-2 font-bold text-zinc-500 bg-white/50 px-3 py-1 rounded-full w-fit">
                                {it.flavorNames.join(" • ")}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      
                      {r.createdAt && (
                        <div className="mt-6 flex items-center gap-2 text-[10px] text-zinc-300 font-black uppercase tracking-widest">
                          <Clock className="h-3.5 w-3.5" />
                          {new Date(r.createdAt?.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  ))}
                  {(!refills || refills.length === 0) && (
                    <div className="p-20 text-center text-zinc-300">
                      <HistoryIcon className="h-16 w-16 mx-auto mb-6 opacity-5" />
                      <p className="text-sm font-black uppercase tracking-widest">No Recent Activity</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>

      <CustomerRefillModal
        open={isRefillOpen}
        onOpenChange={setIsRefillOpen}
        session={session as any}
        sessionIsLocked={false}
      />
    </main>
  );
}
