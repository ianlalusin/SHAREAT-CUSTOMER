"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getAuth } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useFirestore } from "@/firebase/provider";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Star, Loader2, RefreshCw, Unlink2 } from "lucide-react";
import { format } from "date-fns";
import { SharelebratorLinkCard } from "./SharelebratorLinkCard";

interface Props {
  storeId: string;
  sessionId: string;
}

type MeResponse = {
  ok: boolean;
  linked: boolean;
  locked?: boolean;
  customer?: {
    phone: string;
    name: string;
    bday: string;
    email: string | null;
    pointsBalance: number;
  };
  ledger?: {
    id: string;
    type: "earn" | "redeem" | "adjust";
    points: number;
    amount: number;
    storeId: string;
    sessionId: string;
    createdAtMs: number | null;
  }[];
};

export function SharelebratorCardView({ storeId, sessionId }: Props) {
  const firestore = useFirestore();
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const prevLinkRef = useRef<string | null>(null);

  const fetchMe = useCallback(async () => {
    const user = getAuth().currentUser;
    if (!user) return;
    const idToken = await user.getIdToken();
    const res = await fetch("/api/customer/sharelebrator/me", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const json = (await res.json()) as MeResponse;
    setData(json);
  }, []);

  // Initial load
  useEffect(() => {
    (async () => {
      await fetchMe();
      setLoading(false);
    })();
  }, [fetchMe]);

  // Watch session doc — refetch /me whenever link state flips
  useEffect(() => {
    if (!firestore || !storeId || !sessionId) return;
    const ref = doc(firestore, "stores", storeId, "activeSessions", sessionId);
    return onSnapshot(ref, (snap) => {
      const d = snap.data() as any;
      const currentLink = d?.linkedCustomerPhone ?? null;
      if (prevLinkRef.current !== currentLink) {
        prevLinkRef.current = currentLink;
        fetchMe();
      }
    });
  }, [firestore, storeId, sessionId, fetchMe]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetchMe();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleUnlink() {
    const user = getAuth().currentUser;
    if (!user) return;
    setUnlinking(true);
    try {
      const idToken = await user.getIdToken();
      await fetch("/api/customer/sharelebrator/unlink-session", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      await fetchMe();
    } finally {
      setUnlinking(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.linked) {
    return (
      <div className="max-w-md mx-auto mt-4">
        <SharelebratorLinkCard storeId={storeId} sessionId={sessionId} />
      </div>
    );
  }

  const c = data.customer!;
  const ledger = data.ledger || [];
  const locked = !!data.locked;

  return (
    <div className="max-w-md mx-auto space-y-4 pb-4">
      {/* Hero card */}
      <Card
        className="border-0 overflow-hidden relative text-white"
        style={{
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 40%, #3a3a3a 50%, #1a1a1a 60%, #0a0a0a 100%)",
        }}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-0 bottom-0 w-[20%] -skew-x-12"
            style={{
              left: "-20%",
              background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
              animation: "sharelebratorCardShine 5s ease-in-out infinite",
            }}
          />
        </div>
        <style>{`
          @keyframes sharelebratorCardShine {
            0% { left: -20%; }
            70%, 100% { left: 120%; }
          }
        `}</style>
        <CardContent className="relative p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5" fill="currentColor" />
            <span className="text-sm font-bold tracking-widest uppercase">Sharelebrator</span>
          </div>
          <div>
            <p className="text-[10px] uppercase opacity-60 tracking-wider">Cardholder</p>
            <p className="text-2xl font-black leading-tight">{c.name}</p>
            <p className="text-sm font-mono opacity-80 mt-1">{c.phone}</p>
            {c.bday && (
              <p className="text-xs opacity-70 mt-0.5">
                Birthday: {format(new Date(c.bday), "MMMM d")}
              </p>
            )}
          </div>
          <div className="flex items-end justify-between pt-2 border-t border-white/10">
            <div>
              <p className="text-[10px] uppercase opacity-60 tracking-wider">Available Points</p>
              <p className="text-4xl font-black">{c.pointsBalance.toLocaleString()}</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-white hover:bg-white/10 h-8"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b">
            <h3 className="font-semibold text-sm">Recent Transactions</h3>
          </div>
          {ledger.length === 0 ? (
            <p className="px-4 py-8 text-sm text-center text-muted-foreground">
              No transactions yet. Points appear here after checkout.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs text-right">Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs">
                      {entry.createdAtMs ? format(new Date(entry.createdAtMs), "MMM d, h:mma") : "—"}
                    </TableCell>
                    <TableCell className="text-xs capitalize">{entry.type}</TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      ₱{entry.amount.toLocaleString()}
                    </TableCell>
                    <TableCell
                      className={`text-xs text-right font-mono font-bold ${
                        entry.points > 0 ? "text-green-600" : entry.points < 0 ? "text-red-600" : ""
                      }`}
                    >
                      {entry.points > 0 ? "+" : ""}
                      {entry.points}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Unlink — only shown pre-checkout */}
      {!locked && (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={handleUnlink}
          disabled={unlinking}
        >
          {unlinking ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Unlink2 className="h-4 w-4 mr-2" />
          )}
          Unlink this session
        </Button>
      )}
    </div>
  );
}
