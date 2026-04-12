"use client";

import { useEffect, useState } from "react";
import { getAuth, signInWithCustomToken, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useFirestore } from "@/firebase/provider";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, LogOut, Loader2 } from "lucide-react";

export default function SharelebratorCardPage() {
  const firestore = useFirestore();
  const [authedPhone, setAuthedPhone] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Login form state
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Customer doc state
  const [customerData, setCustomerData] = useState<any>(null);

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
    if (!firestore || !authedPhone) {
      setCustomerData(null);
      return;
    }
    const ref = doc(firestore, "customers", authedPhone);
    return onSnapshot(ref, (snap) => {
      setCustomerData(snap.exists() ? snap.data() : null);
    });
  }, [firestore, authedPhone]);

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
    setCustomerData(null);
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authedPhone) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Sharelebrator Card
            </CardTitle>
            <CardDescription>Sign in to view your points.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-3">
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input type="tel" placeholder="09XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} required disabled={submitting} />
              </div>
              <div className="space-y-1">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={submitting} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 p-4">
      <div className="max-w-md mx-auto pt-8 space-y-4">
        <Card className="bg-gradient-to-br from-primary to-red-700 text-white border-0">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                <span className="font-bold">Sharelebrator</span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-white hover:bg-white/10">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>

            <div>
              <p className="text-xs opacity-80">Cardholder</p>
              <p className="text-xl font-bold">{customerData?.name || "—"}</p>
              <p className="text-sm opacity-80 font-mono">{authedPhone}</p>
            </div>

            <div className="bg-white rounded-lg p-4 flex items-center justify-center">
              <QRCodeSVG value={authedPhone} size={160} />
            </div>

            <div className="text-center">
              <p className="text-xs opacity-80">Balance</p>
              <p className="text-4xl font-black">{customerData?.pointsBalance ?? 0}</p>
              <p className="text-sm opacity-80">points</p>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground">
          Show this QR to the cashier to earn points at checkout.
        </p>
      </div>
    </main>
  );
}
