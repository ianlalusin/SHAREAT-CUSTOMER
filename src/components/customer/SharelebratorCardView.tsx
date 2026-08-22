"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useFirestore } from "@/firebase/provider";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Star, Loader2, RefreshCw, Unlink2, Settings, Send, Gift } from "lucide-react";
import { format } from "date-fns";
import { SharelebratorLinkCard } from "./SharelebratorLinkCard";
import { SharelebratorProfileEditDialog } from "./SharelebratorProfileEditDialog";
import { SharelebratorTransferDialog } from "./SharelebratorTransferDialog";

interface Props {
  storeId: string;
  sessionId: string;
}

type MeResponse = {
  ok: boolean;
  linked: boolean;
  locked?: boolean;
  /**
   * Set when the table's card belongs to a different diner. Carries the
   * cardholder's display name and nothing else — the card itself never leaves
   * the server for anyone but the phone that linked it.
   */
  sessionLink?: { byOther: true; name: string };
  customer?: {
    phone: string;
    name: string;
    bday: string;
    address: string;
    email: string | null;
    pointsBalance: number;
  };
  ledger?: {
    id: string;
    type: "earn" | "redeem" | "adjust" | "transfer_out" | "transfer_in";
    points: number;
    amount: number;
    storeId: string;
    sessionId: string;
    createdAtMs: number | null;
    recipientName?: string | null;
    recipientPhone?: string | null;
    senderName?: string | null;
    senderPhone?: string | null;
  }[];
};

export function SharelebratorCardView({ storeId, sessionId }: Props) {
  const router = useRouter();
  const firestore = useFirestore();
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  /**
   * Their OWN card, opened while the table belongs to someone else's.
   *
   * Read-only on purpose: it is not this session's card, so nothing that acts
   * on the session — unlinking, transferring, editing the profile — belongs on
   * it. It shows a balance, and that is the whole point of allowing it.
   */
  const [readOnlyCard, setReadOnlyCard] = useState<{ customer: any; ledger: any[] } | null>(null);
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
    const takenBy = data?.sessionLink?.byOther ? data.sessionLink.name : null;

    if (readOnlyCard) {
      return (
        <div className="max-w-md mx-auto mt-4 space-y-3 pb-4">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm font-bold text-zinc-900">Your card — view only</p>
            <p className="mt-1 text-sm text-zinc-600">
              {takenBy
                ? `This meal is earning points for ${takenBy}'s card, so nothing here will change tonight.`
                : "This session isn't linked to your card, so nothing here will change tonight."}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => setReadOnlyCard(null)}
            >
              Back
            </Button>
          </div>

          <Card className="border-2">
            <CardContent className="p-6 space-y-3">
              <div>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">
                  Cardholder
                </p>
                <p className="text-2xl font-black leading-tight">{readOnlyCard.customer.name}</p>
                <p className="text-sm font-mono text-muted-foreground mt-1">
                  {readOnlyCard.customer.phone}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">
                  Points available
                </p>
                <p className="text-3xl font-black">
                  {Number(readOnlyCard.customer.available ?? 0).toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    return (
      <div className="max-w-md mx-auto mt-4 space-y-3">
        {takenBy ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-900">
              This table is already using {takenBy}&apos;s card
            </p>
            <p className="mt-1 text-sm text-amber-900/80">
              A session can hold one Sharelebrator card, and this one earns points for{" "}
              {takenBy}. Ask them to unlink it if you&apos;d like this meal on your card
              instead.
            </p>
            <p className="mt-2 text-sm text-amber-900/80">
              You can still open your own card below — it just won&apos;t collect points
              from this table.
            </p>
          </div>
        ) : null}

        <SharelebratorLinkCard
          takenBy={takenBy}
          onCard={(card) => setReadOnlyCard(card)}
          storeId={storeId}
          sessionId={sessionId}
          onLinked={() => {
            // Don't rely solely on the session-doc snapshot to flip the view —
            // refetch immediately once the dialog reports a successful link.
            setLoading(true);
            fetchMe().finally(() => setLoading(false));
          }}
        />
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5" fill="currentColor" />
              <span className="text-sm font-bold tracking-widest uppercase">Sharelebrator</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10 h-8 w-8 p-0"
              onClick={() => setEditOpen(true)}
              aria-label="Edit profile"
            >
              <Settings className="h-4 w-4" />
            </Button>
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
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => router.push("/sharelebrator/redeem")}
                className="text-white hover:bg-white/10 h-8 gap-1.5 text-xs"
              >
                <Gift className="h-3.5 w-3.5" />
                Redeem
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setTransferOpen(true)}
                className="text-white hover:bg-white/10 h-8 gap-1.5 text-xs"
              >
                <Send className="h-3.5 w-3.5" />
                Transfer
              </Button>
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
                    <TableCell className="text-xs">
                      {entry.type === "transfer_out"
                        ? `Sent to ${entry.recipientName || "—"}`
                        : entry.type === "transfer_in"
                          ? `From ${entry.senderName || "—"}`
                          : <span className="capitalize">{entry.type}</span>}
                    </TableCell>
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

      <SharelebratorProfileEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={{
          name: c.name,
          address: c.address,
          email: c.email,
          bday: c.bday,
        }}
        onSaved={fetchMe}
      />

      <SharelebratorTransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        senderPhone={c.phone}
        senderBalance={c.pointsBalance}
        onTransferred={fetchMe}
      />
    </div>
  );
}
