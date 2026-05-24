"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Gift, ArrowLeft, Loader2, Ticket, Star } from "lucide-react";

type Reward = { id: string; name: string; description: string | null; pointsCost: number; type: "fixed" | "percent"; value: number };
type Voucher = { id: string; code: string; rewardName: string; type: "fixed" | "percent"; value: number; pointsCost: number; expiresAtMs: number | null; expired: boolean };

function fmtReward(r: { type: "fixed" | "percent"; value: number }) {
  return r.type === "percent" ? `${r.value}% off` : `₱${r.value.toLocaleString()} off`;
}

function Countdown({ expiresAtMs }: { expiresAtMs: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!expiresAtMs) return null;
  const left = Math.max(0, expiresAtMs - now);
  if (left <= 0) return <span className="text-destructive">expired</span>;
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return <span>{m}:{String(s).padStart(2, "0")} left</span>;
}

export default function RedeemPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const user = getAuth().currentUser;
    if (!user) { setError("Please open your loyalty card first."); setLoading(false); return; }
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/customer/sharelebrator/rewards", { headers: { Authorization: `Bearer ${idToken}` } });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Could not load rewards");
      setBalance(json.pointsBalance ?? 0);
      setRewards(json.rewards ?? []);
      setVouchers(json.vouchers ?? []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Could not load rewards");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const redeem = async (reward: Reward) => {
    const user = getAuth().currentUser;
    if (!user) return;
    setBusyId(reward.id);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/customer/sharelebrator/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ rewardId: reward.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Redeem failed");
      await load();
    } catch (e: any) {
      setError(e?.message || "Redeem failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6">
      <div className="max-w-md mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Star className="h-4 w-4 text-amber-500" /> {balance.toLocaleString()} pts
          </div>
        </div>

        <div className="text-center space-y-1">
          <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Gift className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-black">Redeem Rewards</h1>
          <p className="text-xs text-muted-foreground">Redeem points for a reward, then show the code to the cashier.</p>
        </div>

        {error && <p className="text-sm text-destructive text-center">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <>
            {/* Active vouchers */}
            {vouchers.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your vouchers</h2>
                {vouchers.map((v) => (
                  <Card key={v.id} className={v.expired ? "opacity-60" : "border-primary/40"}>
                    <CardContent className="p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm flex items-center gap-1.5"><Ticket className="h-4 w-4 text-primary" /> {v.rewardName}</div>
                        <div className="text-xs text-muted-foreground">{fmtReward(v)} · <Countdown expiresAtMs={v.expiresAtMs} /></div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-black text-lg tracking-widest">{v.code}</div>
                        <div className="text-[10px] text-muted-foreground">show to cashier</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Catalog */}
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Available rewards</h2>
              {rewards.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No rewards available right now.</p>
              ) : (
                rewards.map((r) => {
                  const affordable = balance >= r.pointsCost;
                  return (
                    <Card key={r.id}>
                      <CardContent className="p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm">{r.name}</div>
                          <div className="text-xs text-muted-foreground">{fmtReward(r)} · {r.pointsCost.toLocaleString()} pts{r.description ? ` · ${r.description}` : ""}</div>
                        </div>
                        <Button size="sm" disabled={!affordable || busyId === r.id} onClick={() => redeem(r)}>
                          {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : affordable ? "Redeem" : "Need more"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
