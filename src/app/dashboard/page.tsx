"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { Loader2, Plus, MessageSquare } from "lucide-react";

import { DashboardHeader } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomerRefillModal } from "@/components/customer/CustomerRefillModal";
import { CustomerCatalog } from "@/components/customer/CustomerCatalog";

import { CustomerFeedbackModal } from "@/components/customer/CustomerFeedbackModal";
import { SharelebratorMiniCard } from "@/components/customer/SharelebratorMiniCard";
import { SharelebratorCardView } from "@/components/customer/SharelebratorCardView";
import { FlashAdOverlay } from "@/components/customer/FlashAdOverlay";
import { FlashAdBadge } from "@/components/customer/FlashAdBadge";
import { getAuth } from "firebase/auth";
import { useFirestore } from "@/firebase/provider";

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
  const firestore = useFirestore();

  const [isLoaded, setIsLoaded] = useState(false);
  const [isRefillOpen, setIsRefillOpen] = useState(false);

  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const sessionToken = useMemo(() => getCookie("customer_token") || getCookie("session_token"), []);

  const [session, setSession] = useState<SessionDTO | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [activeTab, setActiveTab] = useState("menu");

  // Link state (for mini card + conditional rendering)
  const [isLinked, setIsLinked] = useState(false);

  // Flash ad state
  const [flashAd, setFlashAd] = useState<{
    imageUrl: string;
    clickBehavior: "close" | "redirect";
    redirectUrl?: string | null;
  } | null>(null);
  const [showFlashAdOverlay, setShowFlashAdOverlay] = useState(false);
  const [flashAdAutoShown, setFlashAdAutoShown] = useState(false);

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

  // Watch session doc for link state — and detect when the cashier closes
  // the session (rules block the read once customerAccessEnabled flips to
  // false, which lands as a permission-denied error here).
  useEffect(() => {
    if (!firestore || !session) return;
    const ref = doc(firestore, "stores", session.storeId, "activeSessions", session.sessionId);
    return onSnapshot(
      ref,
      (snap) => {
        const data = snap.data() as any;
        // If the doc became unreadable / the access fields flipped, treat as ended.
        if (!data || data.customerAccessEnabled === false) {
          const name = encodeURIComponent(session.customerName || "");
          router.replace(`/closed?name=${name}`);
          return;
        }
        setIsLinked(!!data?.linkedCustomerPhone);
      },
      (error) => {
        // permission-denied = cashier disabled customer access (most common cause)
        if ((error as any)?.code === "permission-denied") {
          const name = encodeURIComponent(session.customerName || "");
          router.replace(`/closed?name=${name}`);
        }
      }
    );
  }, [firestore, session, router]);

  // Listen for active flash ads and pick one randomly
  useEffect(() => {
    if (!firestore || !session) return;
    const adsRef = collection(firestore, "stores", session.storeId, "flashAds");
    return onSnapshot(
      adsRef,
      (snap) => {
        const activeAds = snap.docs
          .map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              imageUrl: data.imageUrl as string,
              clickBehavior: (data.clickBehavior === "redirect" ? "redirect" : "close") as "close" | "redirect",
              redirectUrl: (data.redirectUrl || null) as string | null,
              active: data.active === true,
            };
          })
          .filter((a) => a.active && a.imageUrl);

        if (activeAds.length === 0) { setFlashAd(null); return; }

        // Pick a random ad, avoiding the one currently shown if possible
        const seenKey = `flashAdLastId:${session.storeId}:${session.sessionId}`;
        let lastId = "";
        try { lastId = sessionStorage.getItem(seenKey) || ""; } catch {}

        const unseen = activeAds.filter((a) => a.id !== lastId);
        const pool = unseen.length > 0 ? unseen : activeAds;
        const picked = pool[Math.floor(Math.random() * pool.length)];

        try { sessionStorage.setItem(seenKey, picked.id); } catch {}
        setFlashAd({
          imageUrl: picked.imageUrl,
          clickBehavior: picked.clickBehavior,
          redirectUrl: picked.redirectUrl,
        });
      },
      (err) => {
        console.error("[FlashAd] onSnapshot error:", err);
        setFlashAd(null);
      }
    );
  }, [firestore, session]);

  // Auto-show flash ad once per session
  useEffect(() => {
    if (!flashAd || flashAdAutoShown || !session) return;
    const key = `flashAdShown:${session.storeId}:${session.sessionId}`;
    try {
      if (sessionStorage.getItem(key)) {
        setFlashAdAutoShown(true);
        return;
      }
      sessionStorage.setItem(key, "1");
    } catch {}
    setFlashAdAutoShown(true);
    setShowFlashAdOverlay(true);
  }, [flashAd, flashAdAutoShown, session]);

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

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 mt-6 relative z-10">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-sm mx-auto grid-cols-2 mb-6">
            <TabsTrigger value="menu">Menu</TabsTrigger>
            <TabsTrigger value="card">Card</TabsTrigger>
          </TabsList>

          <TabsContent value="menu">
            {/* Primary action */}
            <div className="flex justify-center">
              <Button
                className="w-full sm:w-[420px] h-20 sm:h-28 rounded-[2.5rem] text-lg sm:text-xl font-black shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all bg-primary border-4 border-white/20"
                onClick={() => setIsRefillOpen(true)}
              >
                <Plus className="mr-3 h-8 w-8" />
                Order Refill
              </Button>
            </div>

            <CustomerCatalog />
          </TabsContent>

          <TabsContent value="card">
            <SharelebratorCardView storeId={session.storeId} sessionId={session.sessionId} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Floating Sharelebrator mini card (always visible outside Card tab) */}
      {activeTab !== "card" && (
        <SharelebratorMiniCard onClick={() => setActiveTab("card")} />
      )}

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
            Submit Feedback
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

      {/* Flash Ad */}
      {flashAd && (
        <FlashAdOverlay
          open={showFlashAdOverlay}
          onClose={() => setShowFlashAdOverlay(false)}
          imageUrl={flashAd.imageUrl}
          clickBehavior={flashAd.clickBehavior}
          redirectUrl={flashAd.redirectUrl}
        />
      )}
      {flashAd && !showFlashAdOverlay && (
        <FlashAdBadge onClick={() => setShowFlashAdOverlay(true)} />
      )}
    </main>
  );
}
