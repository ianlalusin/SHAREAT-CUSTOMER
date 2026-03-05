"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, MessageSquare } from "lucide-react";

import { DashboardHeader } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/button";
import { CustomerRefillModal } from "@/components/customer/CustomerRefillModal";
import { CustomerCatalog } from "@/components/customer/CustomerCatalog";

import { CustomerFeedbackModal } from "@/components/customer/CustomerFeedbackModal";
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

function getSessionKeyForFeedback() {
  const storeId = getCookie("store_id") || "nostore";
  const sessionId = getCookie("session_id") || "nosession";
  return `customerFeedbackSubmitted:${storeId}:${sessionId}`;
}

export default function DashboardPage() {
  const router = useRouter();

  const [isLoaded, setIsLoaded] = useState(false);
  const [isRefillOpen, setIsRefillOpen] = useState(false);

  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
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

    const onSubmitted = () => {
      try {
        const key = getSessionKeyForFeedback();
        localStorage.setItem(key, '1');
      } catch {}
      setFeedbackSubmitted(true);
    };

    window.addEventListener('customer-feedback-submitted', onSubmitted as any);

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
        try {
          const key = getSessionKeyForFeedback();
          if (localStorage.getItem(key) === '1') setFeedbackSubmitted(true);
        } catch {}
      }
    }

    run().catch(() => {
      setLoadingSession(false);
      router.push("/");
    });

    return () => {
      cancelled = true;
      try { window.removeEventListener('customer-feedback-submitted', onSubmitted as any); } catch {}
    };
  }, [router]);

  if (!isLoaded || loadingSession || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  const feedbackPulseStyle = `
@keyframes feedbackPulse {
  0%, 88% { transform: scale(1); box-shadow: 0 10px 25px rgba(0,0,0,0.18); }
  90% { transform: scale(1.06); box-shadow: 0 18px 35px rgba(0,0,0,0.22); }
  92% { transform: scale(1); box-shadow: 0 10px 25px rgba(0,0,0,0.18); }
  96% { transform: scale(1.05); box-shadow: 0 16px 32px rgba(0,0,0,0.20); }
  100% { transform: scale(1); box-shadow: 0 10px 25px rgba(0,0,0,0.18); }
}
`;

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
            Order Refill
          </Button>
        </div>

        {/* Menu */}
        <CustomerCatalog />
      </div>
      {/* Floating Feedback bubble */}
      {!feedbackSubmitted && (
        <>
          <style>{feedbackPulseStyle}</style>
          <Button
            className="fixed bottom-5 right-5 z-50 h-12 px-5 rounded-full shadow-xl bg-primary text-white font-bold hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
            style={{ animation: 'feedbackPulse 18s infinite' }}
            onClick={() => setIsFeedbackOpen(true)}
          >
            <MessageSquare className="h-5 w-5" />
            Customer Feedback
          </Button>
        </>
      )}

      <CustomerRefillModal
        open={isRefillOpen}
        onOpenChange={setIsRefillOpen}
        session={session as any}
        sessionIsLocked={false}
      />

      <CustomerFeedbackModal
        open={isFeedbackOpen}
        onOpenChange={setIsFeedbackOpen}
        customerName={session.customerName}
      />
    </main>
  );
}
