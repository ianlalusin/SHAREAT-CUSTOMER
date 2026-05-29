"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, getDocs, onSnapshot } from "firebase/firestore";
import { Loader2, Plus, MessageSquare, Bell, Star } from "lucide-react";

import { DashboardHeader } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { CustomerRefillModal } from "@/components/customer/CustomerRefillModal";
import { CustomerCatalog } from "@/components/customer/CustomerCatalog";
import { useToast } from "@/hooks/use-toast";

import { CustomerFeedbackModal } from "@/components/customer/CustomerFeedbackModal";
import { SharelebratorCardView } from "@/components/customer/SharelebratorCardView";
import { FlashAdOverlay, type FlashAdItem } from "@/components/customer/FlashAdOverlay";
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
  const raw = c.find((x) => x.startsWith(name + "="))?.split("=").slice(1).join("=") ?? "";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

function getSessionKeyForFeedback() {
  const storeId = getCookie("store_id") || "nostore";
  const sessionId = getCookie("session_id") || "nosession";
  return `customerFeedbackSubmitted:${storeId}:${sessionId}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isLoaded, setIsLoaded] = useState(false);
  const [isRefillOpen, setIsRefillOpen] = useState(false);
  const [assistanceBusy, setAssistanceBusy] = useState(false);
  const [assistanceCooldown, setAssistanceCooldown] = useState(false);

  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const sessionToken = useMemo(() => getCookie("customer_token") || getCookie("session_token"), []);

  const [session, setSession] = useState<SessionDTO | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [isCardOpen, setIsCardOpen] = useState(false);

  // Link state (for mini card + conditional rendering)
  const [isLinked, setIsLinked] = useState(false);

  // Flash ad state
  const [flashAds, setFlashAds] = useState<FlashAdItem[]>([]);
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

  // Load active flash ads once on mount. Ads only need to auto-show once per
  // session, so a one-shot read is enough — no need to hold a live listener for
  // the whole meal.
  useEffect(() => {
    if (!firestore || !session) return;
    let cancelled = false;
    const adsRef = collection(firestore, "stores", session.storeId, "flashAds");
    getDocs(adsRef)
      .then((snap) => {
        if (cancelled) return;
        const active = snap.docs
          .map((d) => {
            const data = d.data() as any;
            return {
              imageUrl: data.imageUrl as string,
              clickBehavior: (data.clickBehavior === "redirect" ? "redirect" : "close") as "close" | "redirect",
              redirectUrl: (data.redirectUrl || null) as string | null,
              active: data.active === true,
            };
          })
          .filter((a) => a.active && a.imageUrl);
        setFlashAds(active);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[FlashAd] load error:", err);
        setFlashAds([]);
      });
    return () => { cancelled = true; };
  }, [firestore, session]);

  // Auto-show flash ads once per session
  useEffect(() => {
    if (flashAds.length === 0 || flashAdAutoShown || !session) return;
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
  }, [flashAds, flashAdAutoShown, session]);

  const handleAssistance = async () => {
    if (assistanceBusy || assistanceCooldown) return;
    setAssistanceBusy(true);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Session expired. Please re-enter your PIN.");
      const idToken = await user.getIdToken();
      const res = await fetch("/api/customer/request-assistance", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not notify staff.");
      toast({ title: "Staff notified", description: "Someone will be with you shortly." });
      setAssistanceCooldown(true);
      setTimeout(() => setAssistanceCooldown(false), 30_000);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Couldn't notify staff", description: e?.message ?? "Please try again." });
    } finally {
      setAssistanceBusy(false);
    }
  };

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
@keyframes loyaltyCardShine {
  0% { left: -30%; }
  60%, 100% { left: 130%; }
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

        {/* Secondary actions */}
        <div className="flex justify-center mt-3">
          <div className="w-full sm:w-[420px] grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-14 rounded-2xl text-base font-bold border-2 border-primary/30 text-primary hover:bg-primary/5 active:scale-[0.98] transition-all"
              onClick={handleAssistance}
              disabled={assistanceBusy || assistanceCooldown}
            >
              {assistanceBusy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Bell className="mr-2 h-5 w-5" />}
              {assistanceCooldown ? "Staff notified" : "Ask for assistance"}
            </Button>
            <button
              type="button"
              onClick={() => setIsCardOpen(true)}
              className="relative h-14 rounded-2xl overflow-hidden border border-zinc-700 bg-black shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
              aria-label="Open Loyalty Card"
            >
              <span className="absolute inset-0 pointer-events-none">
                <span
                  className="absolute top-0 bottom-0 w-[30%] -skew-x-12"
                  style={{
                    left: "-30%",
                    background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
                    animation: "loyaltyCardShine 3.5s ease-in-out infinite",
                  }}
                />
              </span>
              <span className="relative flex items-center justify-center gap-2 text-base font-bold text-white">
                <Star className="h-5 w-5 drop-shadow" strokeWidth={2.5} fill="currentColor" />
                Loyalty Card
              </span>
            </button>
          </div>
        </div>

        <CustomerCatalog />
      </div>

      {/* Sharelebrator card — opens in a bottom drawer */}
      <Drawer open={isCardOpen} onOpenChange={setIsCardOpen}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>Sharelebrator Card</DrawerTitle>
            <DrawerDescription>Your points, history, and rewards.</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6 overflow-y-auto">
            <SharelebratorCardView storeId={session.storeId} sessionId={session.sessionId} />
          </div>
        </DrawerContent>
      </Drawer>

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

      {/* Flash Ad Stories */}
      {flashAds.length > 0 && (
        <FlashAdOverlay
          open={showFlashAdOverlay}
          onClose={() => setShowFlashAdOverlay(false)}
          ads={flashAds}
        />
      )}
      {flashAds.length > 0 && !showFlashAdOverlay && (
        <FlashAdBadge onClick={() => setShowFlashAdOverlay(true)} />
      )}
    </main>
  );
}
