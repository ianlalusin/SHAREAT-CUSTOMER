"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Clock, History as HistoryIcon } from "lucide-react";

import { DashboardHeader } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { CustomerRefillModal } from "@/components/customer/CustomerRefillModal";
import { FastRefills } from "@/components/dashboard/FastRefills";
import { ServiceActions } from "@/components/dashboard/ServiceActions";
import { useFirebase } from "@/firebase";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";

function getCookie(name: string) {
  if (typeof document === 'undefined') return "";
  const c = document.cookie.split(";").map((v) => v.trim());
  return c.find((x) => x.startsWith(name + "="))?.split("=").slice(1).join("=") ?? "";
}

type RefillReq = {
  id: string;
  status: "preparing" | "served";
  items: { refillName: string; flavorNames?: string[]; notes?: string | null }[];
  createdAt?: any;
};

export default function DashboardPage() {
  const router = useRouter();
  const { firestore } = useFirebase();

  const [isLoaded, setIsLoaded] = useState(false);
  const [isRefillOpen, setIsRefillOpen] = useState(false);
  const [refills, setRefills] = useState<RefillReq[]>([]);

  const sessionToken = useMemo(() => getCookie("session_token"), []);
  const tableName = useMemo(() => decodeURIComponent(getCookie("session_table") || "B12"), []);
  const customerName = useMemo(() => decodeURIComponent(getCookie("session_customer") || "Customer"), []);

  const storeId = useMemo(() => decodeURIComponent(getCookie("store_id") || "L5MExycvUOfQ96Y10FqF"), []);
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

  useEffect(() => {
    if (!firestore) return;
    const qy = query(
      collection(firestore, "refillRequests"),
      where("tableId", "==", tableName.startsWith("T") ? tableName : `T${tableName.replace(/\D/g, "")}`),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(qy, (snap) => {
      setRefills(
        snap.docs.map((d) => {
          const x = d.data() as any;
          return {
            id: d.id,
            status: x.status === "served" ? "served" : "preparing",
            items: Array.isArray(x.items) ? x.items : [],
            createdAt: x.createdAt,
          };
        })
      );
    });
  }, [firestore, tableName]);

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

      <div className="container max-w-6xl mx-auto px-6 -mt-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Main Actions Area */}
          <div className="md:col-span-2 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Button 
                className="h-24 rounded-[2rem] text-lg font-black shadow-lg hover:scale-[1.02] transition-transform bg-primary"
                onClick={() => setIsRefillOpen(true)}
              >
                <Plus className="mr-2 h-6 w-6" />
                Order Refill
              </Button>
              <Button 
                className="h-24 rounded-[2rem] text-lg font-black shadow-lg hover:scale-[1.02] transition-transform" 
                variant="outline" 
                onClick={() => router.push("/catalog")}
              >
                View Menu
              </Button>
            </div>

            <ServiceActions onServiceRequested={(a) => console.log(a)} />

            <FastRefills onRefillRequested={(it) => console.log(it)} />
          </div>

          {/* Sidebar Area - History */}
          <div className="space-y-6">
            <Card className="rounded-[2rem] border-none shadow-xl overflow-hidden bg-white">
              <CardHeader className="bg-zinc-50/50 flex flex-row items-center justify-between border-b px-8 py-6">
                <div className="flex items-center gap-2">
                  <HistoryIcon className="h-5 w-5 text-zinc-400" />
                  <CardTitle className="text-lg font-black">History</CardTitle>
                </div>
                <Badge variant="secondary" className="rounded-xl px-3 font-bold">{refills.length}</Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y max-h-[600px] overflow-y-auto">
                  {refills.map((r) => (
                    <div key={r.id} className="p-6 hover:bg-zinc-50 transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <div className="font-black text-sm uppercase tracking-tight">Refill Request</div>
                        <Badge className="rounded-xl px-3 py-1 font-black text-[10px]" variant={r.status === "served" ? "secondary" : "default"}>
                          {r.status === "served" ? "SERVED" : "PREPARING"}
                        </Badge>
                      </div>

                      <div className="text-sm text-zinc-500 space-y-2">
                        {r.items.map((it: any, idx: number) => (
                          <div key={idx} className="flex flex-col bg-zinc-100/50 p-3 rounded-2xl">
                            <div className="text-zinc-900 font-bold">{it.refillName}</div>
                            {Array.isArray(it.flavorNames) && it.flavorNames.length ? (
                              <div className="text-xs mt-1">Flavors: {it.flavorNames.join(", ")}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      
                      {r.createdAt && (
                        <div className="mt-4 flex items-center gap-1.5 text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                          <Clock className="h-3 w-3" />
                          {new Date(r.createdAt?.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  ))}
                  {refills.length === 0 && (
                    <div className="p-12 text-center text-zinc-400">
                      <HistoryIcon className="h-12 w-12 mx-auto mb-4 opacity-10" />
                      <p className="text-sm font-medium">No recent activity</p>
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
