"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";

import { DashboardHeader } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/button";
import { CustomerRefillModal } from "@/components/customer/CustomerRefillModal";
import { CustomerCatalog } from "@/components/customer/CustomerCatalog";

import { getAuth } from "firebase/auth";

type SessionDTO = {
  storeId: string;
  sessionId: string;
  customerName: string;
  tableId: string;
  tableNumber: string;
  tableDisplayName: string;
  packageOfferingId: string;
  packageName: string;
  initialFlavorIds: string[];
  status: string;
  sessionMode: string;
};

function getCookie(name: string) {
  if (typeof document === "undefined") return "";
  const c = document.cookie.split(";").map((v) => v.trim());
  return c.find((x) => x.startsWith(name + "="))?.split("=").slice(1).join("=") ?? "";
}

export default function DashboardPage() {
  const router = useRouter();

  const [isLoaded, setIsLoaded] = useState(false);
  const [isRefillOpen, setIsRefillOpen] = useState(false);

  const sessionToken = useMemo(() => getCookie("customer_token") || getCookie("session_token"), []);

  const [session, setSession] = useState<SessionDTO | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    if (!sessionToken) {
      router.push("/");
      return;
    }
    const t = setTimeout(() => setIsLoaded(true), 120);
    return () => clearTimeout(t);
  }, [router, sessionToken]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoadingSession(true);

      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        router.push("/");
        return;
      }

      const idToken = await user.getIdToken();

      const res = await fetch("/api/customer/session", {
        method: "GET",
        headers: { Authorization: `Bearer ${idToken}` },
      });

      const json = (await res.json().catch(() => ({}))) as any;

      if (!res.ok || !json?.ok) {
        router.push("/");
        return;
      }

      if (!cancelled) {
        setSession(json.session as SessionDTO);
        setLoadingSession(false);
      }
    }

    run().catch(() => {
      setLoadingSession(false);
      router.push("/");
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!isLoaded || loadingSession || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  const deviceLabel = useMemo(() => {
    try {
      const ua = navigator.userAgent || "";
      const platform = (navigator as any).userAgentData?.platform || navigator.platform || "";
      const model = (navigator as any).userAgentData?.model || "";
      const isiPhone = /iPhone/i.test(ua);
      const isiPad = /iPad/i.test(ua);
      const isAndroid = /Android/i.test(ua);
      const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);

      const deviceName = isiPhone ? "iPhone" : isiPad ? "iPad" : isAndroid ? "Android" : isMobile ? "Mobile" : "Desktop";
      const parts = [deviceName, model || platform].filter(Boolean);
      return parts.join(" • ");
    } catch {
      return "Device";
    }
  }, []);

  return (
    <main className="min-h-screen pb-16 flex flex-col bg-zinc-50">
      <DashboardHeader
        customerName={session.customerName}
        tableDisplayName={session.tableDisplayName || (session.tableNumber ? `Table ${session.tableNumber}` : "Table -")}
        packageName={session.packageName || "Package -"}
      />

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 mt-10 relative z-10">
        {/* Centered primary action */}
        <div className="flex justify-center">
          <Button
            className="w-full sm:w-[420px] h-20 sm:h-28 rounded-[2.5rem] text-lg sm:text-xl font-black shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all bg-primary border-4 border-white/20"
            onClick={() => setIsRefillOpen(true)}
          >
            <Plus className="mr-3 h-8 w-8" />
            <span className="flex flex-col items-start leading-none">
              <span>Order Refill</span>
              <span className="text-[11px] sm:text-xs font-semibold opacity-80 mt-1">
                {deviceLabel}
              </span>
            </span>
          </Button>
        </div>

        {/* Menu */}
        <CustomerCatalog />
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
