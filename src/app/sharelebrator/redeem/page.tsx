"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Gift, ArrowLeft, Loader2, Ticket, Star, RefreshCw, CheckCircle2 } from "lucide-react";

type Reward = { id: string; name: string; description: string | null; pointsCost: number; type: "fixed" | "percent"; value: number; imageUrl?: string | null };
type Voucher = { id: string; code: string; rewardName: string; type: "fixed" | "percent"; value: number; pointsCost: number; expiresAtMs: number | null; expired: boolean; state: "pending" | "collectible" | "used"; appliedReceiptId?: string | null; appliedAtMs?: number | null };

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

function RewardCard({
  r,
  available,
  busy,
  onRedeem,
}: {
  r: Reward;
  available: number;
  busy: boolean;
  onRedeem: () => void;
}) {
  const affordable = available >= r.pointsCost;
  const shortBy = Math.max(0, r.pointsCost - available);

  return (
    <div className="group relative aspect-[3/2] w-full overflow-hidden rounded-2xl border bg-zinc-900 shadow-sm transition-transform duration-200 active:scale-[0.99]">
      {/* Image (full-bleed) or branded fallback */}
      {r.imageUrl ? (
        <img
          src={r.imageUrl}
          alt={r.name}
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary to-rose-900">
          <Gift className="h-16 w-16 text-white/25" />
        </div>
      )}

      {/* Bottom scrim so overlaid text stays legible on any image */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

      {/* Points cost — glassy gold chip, top-right */}
      <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/35 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
        <Star className="h-3.5 w-3.5 text-amber-400" /> {r.pointsCost.toLocaleString()} pts
      </div>

      {/* Name, offer + action — overlaid at the bottom */}
      <div className="absolute inset-x-0 bottom-0 space-y-2.5 p-4">
        <div>
          <h3 className="text-lg font-black leading-tight text-white drop-shadow-sm">{r.name}</h3>
          <p className="truncate text-sm font-medium text-white/85">
            {fmtReward(r)}
            {r.description ? <span className="text-white/55"> · {r.description}</span> : null}
          </p>
        </div>
        <Button
          size="sm"
          onClick={onRedeem}
          disabled={!affordable || busy}
          className={
            affordable
              ? "shadow-lg shadow-black/30"
              : "bg-white/15 text-white hover:bg-white/15"
          }
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : affordable ? (
            "Redeem"
          ) : (
            `Need ${shortBy.toLocaleString()} more`
          )}
        </Button>
      </div>
    </div>
  );
}

export default function RedeemPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balance, setBalance] = useState(0);
  const [reserved, setReserved] = useState(0);
  const [available, setAvailable] = useState(0);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * False when the list is the global catalogue rather than one branch's —
   * a card opened away from a table. Claiming needs a branch, so say that
   * rather than letting the member tap into a refusal.
   */
  const [storeScoped, setStoreScoped] = useState(true);

  const load = useCallback(async () => {
    const user = getAuth().currentUser;
    if (!user) { setError("Please open your loyalty card first."); setLoading(false); return; }
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/customer/sharelebrator/rewards", { headers: { Authorization: `Bearer ${idToken}` } });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Could not load rewards");
      const bal = json.pointsBalance ?? 0;
      const res2 = json.pointsReserved ?? 0;
      setBalance(bal);
      setReserved(res2);
      setAvailable(json.available ?? Math.max(0, bal - res2));
      setRewards(json.rewards ?? []);
      setVouchers(json.vouchers ?? []);
      setStoreScoped(json.storeScoped !== false);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Could not load rewards");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  };

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

  const collect = async (voucher: Voucher) => {
    const user = getAuth().currentUser;
    if (!user) return;
    setCollectingId(voucher.id);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/customer/sharelebrator/collect-voucher", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ voucherId: voucher.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not collect points");
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not collect points");
    } finally {
      setCollectingId(null);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6">
      <div className="max-w-md mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="flex items-center gap-1.5">
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <Star className="h-4 w-4 text-amber-500" /> {available.toLocaleString()} pts
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={refresh}
              disabled={refreshing || loading}
              aria-label="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <div className="text-center space-y-1">
          <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Gift className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-black">Redeem Rewards</h1>
          <p className="text-xs text-muted-foreground">Redeem points for a reward, then show the code to the cashier.</p>
          {reserved > 0 && (
            <p className="text-[11px] font-medium text-amber-600">
              {reserved.toLocaleString()} of {balance.toLocaleString()} pts on hold for pending vouchers · spent only when used
            </p>
          )}
        </div>

        {error && <p className="text-sm text-destructive text-center">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <>
            {/* Your vouchers — pending (immutable, code shown) and used */}
            {vouchers.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your vouchers</h2>
                {vouchers.map((v) => {
                  const used = v.state === "used";
                  const expired = v.state === "collectible";
                  return (
                    <Card key={v.id} className={used ? "opacity-70" : expired ? "border-amber-400/60" : "border-primary/40"}>
                      <CardContent className="p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm flex items-center gap-1.5"><Ticket className="h-4 w-4 text-primary" /> {v.rewardName}</div>
                          <div className="text-xs text-muted-foreground">
                            {fmtReward(v)} · {used
                              ? <span className="font-medium text-emerald-600">used in billing</span>
                              : expired
                                ? <span className="font-medium text-destructive">expired · {v.pointsCost.toLocaleString()} pts on hold</span>
                                : <Countdown expiresAtMs={v.expiresAtMs} />}
                          </div>
                        </div>
                        <div className="text-right">
                          {used ? (
                            <div className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600">
                              <CheckCircle2 className="h-4 w-4" /> Used
                            </div>
                          ) : expired ? (
                            <Button
                              size="sm"
                              onClick={() => collect(v)}
                              disabled={collectingId === v.id}
                              className="gap-1.5"
                            >
                              {collectingId === v.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Star className="h-4 w-4" />
                              )}
                              Collect {v.pointsCost.toLocaleString()} pts
                            </Button>
                          ) : (
                            <>
                              <div className="font-mono font-black text-lg tracking-widest">{v.code}</div>
                              <div className="text-[10px] text-muted-foreground">show to cashier · pending</div>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Catalog */}
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Available rewards</h2>
              {!storeScoped && (
                <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                  You&apos;re browsing away from a table. Scan in at a branch to claim — each
                  branch chooses which rewards it offers, so this list may differ there.
                </p>
              )}
              {rewards.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No rewards available right now.</p>
              ) : (
                rewards.map((r) => (
                  <RewardCard
                    key={r.id}
                    r={r}
                    available={available}
                    busy={busyId === r.id}
                    onRedeem={() => redeem(r)}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
