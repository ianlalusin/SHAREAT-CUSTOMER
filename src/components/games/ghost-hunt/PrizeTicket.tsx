"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Lock, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { prizeCharacter, svgUrl, type Pack } from "./packs";

export type TicketData = {
  catchId: string;
  status: "won" | "claimed";
  prizeId: string;
  prizeName: string;
  code: string;
  storeId?: string;
  storeName: string;
  tableDisplayName: string;
  day: string;
  wonAtMs: number;
  claimedAtMs: number | null;
  locked: boolean;
};

function manilaDay(ms: number) {
  return new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
}

/**
 * The prize ticket the diner shows at the counter.
 *
 * The moving ghost and the running clock are there for the cashier: a
 * screenshot of someone else's ticket does not move, and its clock is wrong.
 * The cashier types the branch PIN here to hand the prize over — once.
 */
export function PrizeTicket({
  ticket,
  pack,
  hashtag,
  tagHandle,
  onChange,
  onBack,
  onSharePhoto,
}: {
  ticket: TicketData;
  pack: Pack;
  hashtag: string;
  tagHandle: string;
  onChange: (t: TicketData) => void;
  onBack: () => void;
  /** Opens the prize photo saved on this phone, or null when there is none. */
  onSharePhoto: (() => void) | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const character = prizeCharacter(pack, ticket.prizeId, 0);
  const claimed = ticket.status === "claimed";
  const expired = !claimed && manilaDay(now) !== ticket.day;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/customer/games/ghost-hunt/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catchId: ticket.catchId, pin }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Could not confirm.");
        if (res.status === 423) onChange({ ...ticket, locked: true });
        return;
      }
      setPin("");
      onChange(json.ticket);
    } finally {
      setBusy(false);
    }
  };

  const clock = new Date(now).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", second: "2-digit" });

  return (
    <div className="space-y-4">
      <style>{`@keyframes ghostbob{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-12px) rotate(4deg)}}`}</style>
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm font-semibold text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div
        className={`relative overflow-hidden rounded-3xl p-6 text-center shadow-lg ${
          claimed ? "bg-zinc-200 text-zinc-600" : `bg-gradient-to-br ${pack.bg} text-white`
        }`}
      >
        <img
          src={svgUrl(character.svg)}
          alt=""
          className={`mx-auto h-32 w-32 ${claimed ? "opacity-40 grayscale" : ""}`}
          style={{ animation: claimed ? undefined : "ghostbob 2.4s ease-in-out infinite" }}
        />
        <p className="mt-2 text-xs font-bold uppercase tracking-widest opacity-70">{claimed ? "Prize given" : "You won"}</p>
        <p className="text-3xl font-black leading-tight">{ticket.prizeName}</p>
        <p className="mt-4 font-mono text-4xl font-black tracking-[0.3em]">{ticket.code}</p>
        <p className="mt-3 text-sm opacity-80">
          {ticket.storeName} · {ticket.tableDisplayName}
        </p>
        <p className="text-sm font-bold tabular-nums">{clock}</p>
        {claimed && ticket.claimedAtMs ? (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-sm font-bold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Given at{" "}
            {new Date(ticket.claimedAtMs).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })}
          </p>
        ) : expired ? (
          <p className="mt-3 text-sm font-bold text-red-300">This prize was for {ticket.day} and has expired.</p>
        ) : (
          <p className="mt-3 text-xs opacity-70">Valid today only, at this branch.</p>
        )}
      </div>

      {!claimed && !expired && (
        <>
          <div className="rounded-3xl bg-white p-5 shadow-sm text-sm">
            <p className="font-black">Before you go to the counter</p>
            <p className="mt-2">
              Post your photo on Facebook, Instagram or TikTok. Tag <b>{tagHandle}</b> and add <b>{hashtag}</b>. Show the
              post and this ticket to the cashier.
            </p>
            {onSharePhoto && (
              <Button onClick={onSharePhoto} variant="secondary" className="mt-3 h-11 w-full rounded-2xl font-bold">
                <Share2 className="mr-2 h-4 w-4" /> Share my prize photo
              </Button>
            )}
          </div>

          <div className="rounded-3xl border-2 border-dashed border-zinc-300 bg-white p-5">
            <p className="font-black">For the cashier</p>
            {ticket.locked ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-amber-700">
                <Lock className="h-4 w-4" /> Locked after too many wrong PINs. The manager can release it from Manager → Christmas Hunt.
              </p>
            ) : (
              <>
                <p className="mt-1 text-xs text-muted-foreground">
                  Check the post is public and tags {tagHandle}. Hand over the prize, then enter the branch PIN.
                </p>
                <div className="mt-3 flex gap-2">
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={6}
                    placeholder="Branch PIN"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    className="h-12 rounded-2xl text-center text-lg tracking-widest"
                    style={{ WebkitTextSecurity: "disc" } as any}
                  />
                  <Button onClick={confirm} disabled={busy || pin.length < 4} className="h-12 rounded-2xl px-5 font-black">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Given"}
                  </Button>
                </div>
                {error && <p className="mt-2 text-sm font-semibold text-destructive">{error}</p>}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
