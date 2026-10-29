"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getAuth, signInWithCustomToken, signOut, onAuthStateChanged } from "firebase/auth";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, LogOut, Loader2, ArrowLeft, Settings, RefreshCw, Star, QrCode } from "lucide-react";
import { format } from "date-fns";
import { SharelebratorProfileEditDialog } from "@/components/customer/SharelebratorProfileEditDialog";

type MeResponse = {
  ok: boolean;
  linked: boolean;
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
    type: "earn" | "redeem" | "adjust";
    points: number;
    amount: number;
    storeId: string;
    sessionId: string;
    createdAtMs: number | null;
  }[];
};

export default function SharelebratorCardPage() {
  const router = useRouter();
  const [authedPhone, setAuthedPhone] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Login form state
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<MeResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [flipped, setFlipped] = useState(false);

  const fetchMe = useCallback(async () => {
    const user = getAuth().currentUser;
    if (!user) return;
    const idToken = await user.getIdToken();
    const res = await fetch("/api/customer/sharelebrator/me", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (res.status === 401) {
      await signOut(getAuth());
      setAuthedPhone(null);
      return;
    }
    const json = (await res.json()) as MeResponse;
    setData(json);
  }, []);

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const token = await user.getIdTokenResult();
        if (token.claims.loyaltyCustomer === true) {
          setAuthedPhone(String(token.claims.phone || ""));
        } else {
          setAuthedPhone(null);
        }
      } else {
        setAuthedPhone(null);
      }
      setChecking(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (authedPhone) fetchMe();
    else setData(null);
  }, [authedPhone, fetchMe]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/customer/sharelebrator/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Login failed.");
      await signInWithCustomToken(getAuth(), json.token);
      setPhone("");
      setPassword("");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    await signOut(getAuth());
    setData(null);
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetchMe();
    } finally {
      setRefreshing(false);
    }
  }

  function handleExit() {
    router.push("/");
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ───────── Login screen ─────────
  if (!authedPhone) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 p-4">
        <div className="w-full max-w-sm space-y-3">
          <div className="flex">
            <Button variant="ghost" size="sm" onClick={handleExit} className="text-muted-foreground">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Sharelebrator Card
              </CardTitle>
              <CardDescription>Sign in to view your points and manage your card.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-3">
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input
                    type="tel"
                    placeholder="09XXXXXXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={submitting}
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
              </form>
            </CardContent>
          </Card>
          <p className="text-xs text-center text-muted-foreground">
            Don't have a card yet? Create one during your next visit using the in-store PIN.
          </p>
        </div>
      </main>
    );
  }

  // ───────── Authed: full card view ─────────
  const c = data?.customer;
  const ledger = data?.ledger ?? [];

  return (
    <main className="min-h-screen bg-zinc-50 p-4">
      <div className="max-w-md mx-auto pt-2 space-y-4">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={handleExit} className="text-muted-foreground">
            <ArrowLeft className="h-4 w-4 mr-1" /> Exit
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground">
            <LogOut className="h-4 w-4 mr-1" /> Sign out
          </Button>
        </div>

        {!c ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Hero card — flip container (rectangular) */}
            <style>{`
              @keyframes sharelebratorCardShine {
                0% { left: -20%; }
                70%, 100% { left: 120%; }
              }
            `}</style>
            <div
              className="relative w-full"
              style={{ perspective: "1500px", height: "230px" }}
            >
              <div
                className="relative w-full h-full transition-transform duration-700"
                style={{
                  transformStyle: "preserve-3d",
                  transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                }}
              >
                {/* FRONT */}
                <Card
                  className="absolute inset-0 border-0 overflow-hidden text-white"
                  style={{
                    background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 40%, #3a3a3a 50%, #1a1a1a 60%, #0a0a0a 100%)",
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
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
                  <CardContent className="relative p-4 h-full flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Star className="h-4 w-4" fill="currentColor" />
                        <span className="text-xs font-bold tracking-widest uppercase">Sharelebrator</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-white hover:bg-white/10 h-7 w-7 p-0"
                        onClick={() => setEditOpen(true)}
                        aria-label="Edit profile"
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="leading-none space-y-0.5">
                      <p className="text-[9px] uppercase opacity-60 tracking-wider">Cardholder</p>
                      <p className="text-xl font-black leading-tight">{c.name}</p>
                      <p className="text-xs font-mono opacity-80">{c.phone}</p>
                      {c.bday && (
                        <p className="text-[10px] opacity-70">
                          Birthday: {format(new Date(c.bday), "MMMM d")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-end justify-between pt-1.5 border-t border-white/10">
                      <div className="leading-none">
                        <p className="text-[9px] uppercase opacity-60 tracking-wider">Available Points</p>
                        <p className="text-3xl font-black">{c.pointsBalance.toLocaleString()}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="text-white hover:bg-white/10 h-7"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* BACK */}
                <Card
                  className="absolute inset-0 border-0 overflow-hidden text-white"
                  style={{
                    background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 40%, #3a3a3a 50%, #1a1a1a 60%, #0a0a0a 100%)",
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                  }}
                >
                  <CardContent className="relative p-4 h-full flex items-center gap-4">
                    <div className="bg-white rounded-lg p-2 flex items-center justify-center flex-shrink-0">
                      <QRCodeSVG value={c.phone} size={150} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="leading-none">
                        <p className="text-[9px] uppercase opacity-60 tracking-wider">Cardholder</p>
                        <p className="text-base font-bold leading-tight truncate">{c.name}</p>
                        <p className="text-[10px] opacity-70 font-mono mt-0.5">{c.phone}</p>
                      </div>
                      <div className="leading-none pt-1 border-t border-white/10">
                        <p className="text-[9px] uppercase opacity-60 tracking-wider">Balance</p>
                        <p className="text-2xl font-black">{c.pointsBalance.toLocaleString()}</p>
                        <p className="text-[10px] opacity-60">points</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Flip toggle */}
            <Button
              size="sm"
              className="w-full bg-primary hover:bg-primary/90 text-white font-semibold shadow"
              onClick={() => setFlipped((f) => !f)}
            >
              <QrCode className="h-4 w-4 mr-2" />
              {flipped ? "Show card" : "Show QR code"}
            </Button>

            {/* Transactions */}
            <Card>
              <CardContent className="p-0">
                <div className="px-4 py-3 border-b">
                  <h3 className="font-semibold text-sm">Recent Transactions</h3>
                </div>
                {ledger.length === 0 ? (
                  <p className="px-4 py-8 text-sm text-center text-muted-foreground">
                    No transactions yet.
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
          </>
        )}
        <p className="pb-6 pt-2 text-center text-xs text-muted-foreground">
          <a href="/privacy" className="underline">
            Privacy Notice
          </a>
        </p>
      </div>
    </main>
  );
}
