"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Ghost,
  Gift,
  Loader2,
  Share2,
  Ticket,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { markView, signalUse } from "@/lib/games/trackGame";
import { packFor, pick, prizeCharacter, svgUrl, type Character, type Pack } from "./packs";
import { PrizeTicket, type TicketData } from "./PrizeTicket";

const GAME_ID = "ghost-hunt";
const TICKET_KEY = "shareat_ghost_ticket";

type Status = {
  live: boolean;
  message: string | null;
  theme: string;
  hours: string;
  endsAtMs: number;
  prizes: { id: string; name: string }[];
  hashtag: string;
  tagHandle: string;
  canPlay: boolean;
  ticket: TicketData | null;
};

type Spawn = {
  key: number;
  kind: "hello" | "flyby" | "prize";
  character: Character;
  img: HTMLImageElement;
  spawnId?: string;
  prizeName?: string;
  /** Where in the room it lives, as a compass angle. Null = no motion sensor. */
  yaw: number | null;
  bornAt: number;
  ttlMs: number;
};

type Phase = "intro" | "hunting" | "photo" | "ticket";

/** The camera sees about this many degrees across, on a typical phone held upright. */
const FOV_DEG = 55;
const GHOST_PX = 170;

function wrap180(d: number) {
  return ((((d + 180) % 360) + 360) % 360) - 180;
}

async function authHeaders(): Promise<Record<string, string>> {
  const u = getAuth().currentUser;
  return u ? { Authorization: `Bearer ${await u.getIdToken()}` } : {};
}

function loadImg(svg: string): HTMLImageElement {
  const img = new Image();
  img.src = svgUrl(svg);
  return img;
}

/**
 * Spot a Ghost.
 *
 * The phone is only the window: it asks the server every few seconds whether
 * anything is here, and draws what it is told. A prize ghost is pinned to a
 * spot in the room (via the compass), so the diner has to turn around to find
 * it before it fades — that is the "spot" in Spot a Ghost.
 */
export function GhostHuntGame() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [ticket, setTicket] = useState<TicketData | null>(null);

  const pack = packFor(status?.theme || "halloween");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/customer/games/ghost-hunt", { headers: await authHeaders(), cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load the hunt.");
      setStatus(json as Status);

      // The table's prize from the server wins; otherwise a ticket this phone
      // saved earlier (the session may already be closed at the counter).
      if (json.ticket) {
        setTicket(json.ticket);
        try {
          localStorage.setItem(TICKET_KEY, json.ticket.catchId);
        } catch {}
      } else {
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(TICKET_KEY);
        } catch {}
        if (saved) {
          const r = await fetch(`/api/customer/games/ghost-hunt/claim?id=${encodeURIComponent(saved)}`, {
            cache: "no-store",
          });
          const j = await r.json().catch(() => ({}));
          if (r.ok && j?.ok) setTicket(j.ticket);
        }
      }
    } catch (e: any) {
      setError(e?.message || "Could not load the hunt.");
    }
  }, []);

  useEffect(() => {
    markView(GAME_ID);
    const unsub = onAuthStateChanged(getAuth(), () => load());
    return () => unsub();
  }, [load]);

  if (error) return <p className="py-16 text-center text-sm text-destructive">{error}</p>;
  if (!status) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (phase === "ticket" && ticket) {
    return (
      <PrizeTicket
        ticket={ticket}
        pack={pack}
        hashtag={status.hashtag}
        tagHandle={status.tagHandle}
        onChange={setTicket}
        onBack={() => setPhase("intro")}
      />
    );
  }

  const start = async () => {
    // iPhones only hand out the compass after a tap asks for it. Refusing is
    // fine: ghosts then drift across the screen instead of hiding in the room.
    const DOE = (window as any).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        await DOE.requestPermission();
      } catch {}
    }
    setPhase("hunting");
  };

  return (
    <>
      <style>{`@keyframes ghostbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}`}</style>
      <Intro
        status={status}
        pack={pack}
        ticket={ticket}
        onStart={start}
        onTicket={() => setPhase("ticket")}
      />
      {(phase === "hunting" || phase === "photo") && (
        <Hunt
          status={status}
          pack={pack}
          tableHasWon={!!ticket}
          onClose={() => {
            setPhase("intro");
            load();
          }}
          onWon={(t) => {
            setTicket(t);
            try {
              localStorage.setItem(TICKET_KEY, t.catchId);
            } catch {}
          }}
          onShowTicket={() => setPhase("ticket")}
          onEnded={(msg) => {
            setStatus((s) => (s ? { ...s, live: false, message: msg } : s));
            setPhase("intro");
          }}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------- intro */

function Intro({
  status,
  pack,
  ticket,
  onStart,
  onTicket,
}: {
  status: Status;
  pack: Pack;
  ticket: TicketData | null;
  onStart: () => void;
  onTicket: () => void;
}) {
  const hero = pack.prizeFallback[0];
  const endDate = new Date(status.endsAtMs).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });

  return (
    <div className="space-y-4">
      <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${pack.bg} p-6 text-white shadow-lg`}>
        <img
          src={svgUrl((pack.prizeById.melona ?? hero).svg)}
          alt=""
          className="pointer-events-none absolute -right-1 -top-1 h-36 w-36 animate-[ghostbob_3s_ease-in-out_infinite] opacity-90"
        />
        <p className="text-xs font-bold uppercase tracking-widest text-violet-200">{pack.label} hunt · until {endDate}</p>
        <h2 className="mt-2 max-w-[70%] text-3xl font-black leading-tight">Spot a {pack.noun}, win a treat</h2>
        <p className="mt-2 max-w-[75%] text-sm text-white/80">
          {pack.noun === "ghost" ? "Ghosts" : "Visitors"} are hiding around the restaurant. Some say hi, some fly
          past, and a few carry a prize.
        </p>

        {ticket ? (
          <Button onClick={onTicket} className="mt-5 h-12 w-full rounded-2xl bg-amber-400 font-black text-zinc-900 hover:bg-amber-300">
            <Ticket className="mr-2 h-5 w-5" />
            {ticket.status === "claimed" ? "See your prize" : `Show my prize: ${ticket.prizeName}`}
          </Button>
        ) : null}

        {!status.live ? (
          <p className="mt-5 rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold">{status.message}</p>
        ) : !status.canPlay ? (
          <p className="mt-5 rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold">
            Join your table first — scan the QR or enter the PIN on your slip.
          </p>
        ) : (
          <Button
            onClick={onStart}
            className={`mt-3 h-14 w-full rounded-2xl text-lg font-black ${
              ticket ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-violet-900 hover:bg-violet-50"
            }`}
          >
            <Camera className="mr-2 h-5 w-5" />
            {ticket ? "Keep hunting for fun" : "Open camera & hunt"}
          </Button>
        )}
      </div>

      <div className="rounded-3xl bg-white p-5 shadow-sm">
        <p className="font-black">How to win</p>
        <ol className="mt-3 space-y-2 text-sm">
          <li className="flex gap-3"><Step n={1} />Open the camera and slowly look around the room.</li>
          <li className="flex gap-3"><Step n={2} />When a prize {pack.noun} appears, follow the arrow and tap it before it fades.</li>
          <li className="flex gap-3">
            <Step n={3} />
            Post the photo on Facebook, Instagram or TikTok. Tag {status.tagHandle} and add {status.hashtag}.
          </li>
          <li className="flex gap-3"><Step n={4} />Show your post and prize ticket to the cashier.</li>
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">
          {pack.noun === "ghost" ? "Ghosts" : "They"} come out {status.hours}. One prize per table per visit, while
          today&apos;s prizes last. Prizes are valid on the day they are won.
        </p>
      </div>

      {status.prizes.length > 0 && (
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="font-black">Prizes</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {status.prizes.map((p, i) => {
              const c = prizeCharacter(pack, p.id, i);
              return (
                <div key={p.id} className="flex items-center gap-2 rounded-2xl bg-zinc-50 p-2">
                  <img src={svgUrl(c.svg)} alt="" className="h-12 w-12 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-tight">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">from {c.name}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-black text-violet-800">
      {n}
    </span>
  );
}

/* ----------------------------------------------------------------- hunt */

function Hunt({
  status,
  pack,
  tableHasWon,
  onClose,
  onWon,
  onShowTicket,
  onEnded,
}: {
  status: Status;
  pack: Pack;
  tableHasWon: boolean;
  onClose: () => void;
  onWon: (t: TicketData) => void;
  onShowTicket: () => void;
  onEnded: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ghostRef = useRef<HTMLButtonElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const yawRef = useRef<number | null>(null);
  const spawnRef = useRef<Spawn | null>(null);
  const posRef = useRef({ x: 0, y: 0, visible: false });

  const [camError, setCamError] = useState<string | null>(null);
  const [spawn, setSpawn] = useState<Spawn | null>(null);
  const [arrow, setArrow] = useState<"left" | "right" | null>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [catching, setCatching] = useState(false);
  const [photo, setPhoto] = useState<{ url: string; blob: Blob; won: TicketData | null; name: string } | null>(null);

  const showToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2600);
  }, []);

  const setActive = useCallback((s: Spawn | null) => {
    spawnRef.current = s;
    setSpawn(s);
    setBubble(null);
    if (!s) setArrow(null);
  }, []);

  /* camera + compass */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        signalUse(GAME_ID);
      } catch (e: any) {
        setCamError(
          e?.name === "NotAllowedError"
            ? "Camera is blocked. Allow camera access for this site in your browser settings, then try again."
            : "Could not open the camera on this phone."
        );
      }
    })();

    const onOrient = (e: DeviceOrientationEvent) => {
      const anyE = e as any;
      // iOS gives a true compass heading; elsewhere alpha (which turns the other way).
      if (typeof anyE.webkitCompassHeading === "number") yawRef.current = 360 - anyE.webkitCompassHeading;
      else if (typeof e.alpha === "number") yawRef.current = e.alpha;
    };
    window.addEventListener("deviceorientation", onOrient);

    return () => {
      cancelled = true;
      window.removeEventListener("deviceorientation", onOrient);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  /* scan loop: ask the server what is here */
  useEffect(() => {
    if (camError || photo) return;
    let timer: number | undefined;
    let stopped = false;

    const schedule = (ms: number) => {
      timer = window.setTimeout(scan, ms);
    };

    async function scan() {
      if (stopped) return;
      if (spawnRef.current) return schedule(1500);
      try {
        const res = await fetch("/api/customer/games/ghost-hunt/scan", { method: "POST", headers: await authHeaders() });
        const json = await res.json().catch(() => ({}));
        if (stopped) return;
        if (res.status === 409) return onEnded(json?.error || "The hunt is paused.");
        if (!res.ok || !json?.ok) {
          showToast(json?.error || "Lost the signal. Retrying…");
          return schedule(10_000);
        }
        if (json.kind !== "none") spawnGhost(json);
        schedule(Math.max(Number(json.retryInMs) || 9000, 8500) + Math.random() * 4000);
      } catch {
        if (!stopped) schedule(10_000);
      }
    }

    function spawnGhost(r: { kind: "hello" | "flyby" | "prize"; spawnId?: string; prizeId?: string; prizeName?: string; ttlMs?: number }) {
      const yaw = yawRef.current;
      let character: Character;
      let ttlMs: number;
      let offset: number;
      if (r.kind === "prize") {
        const idx = status.prizes.findIndex((p) => p.id === r.prizeId);
        character = prizeCharacter(pack, r.prizeId || "", idx);
        ttlMs = Math.max(4000, (r.ttlMs || 12_000) - 1200);
        // Behind them or off to the side, so they have to turn and look.
        offset = (35 + Math.random() * 45) * (Math.random() < 0.5 ? -1 : 1);
      } else if (r.kind === "hello") {
        character = pick(pack.hello);
        ttlMs = 9000;
        offset = (8 + Math.random() * 30) * (Math.random() < 0.5 ? -1 : 1);
      } else {
        character = pick(pack.flyby);
        ttlMs = 1800;
        offset = 0;
      }
      setActive({
        key: Date.now(),
        kind: r.kind,
        character,
        img: loadImg(character.svg),
        spawnId: r.spawnId,
        prizeName: r.prizeName,
        yaw: yaw === null || r.kind === "flyby" ? null : yaw + offset,
        bornAt: performance.now(),
        ttlMs,
      });
      if (r.kind === "prize") {
        navigator.vibrate?.([80, 60, 80]);
        showToast(`Something glows nearby… a prize ${pack.noun}!`);
      }
    }

    schedule(2500);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [camError, photo, pack, status.prizes, onEnded, setActive, showToast]);

  /* animation: place the ghost where it lives in the room */
  useEffect(() => {
    let raf = 0;
    let lastArrow: "left" | "right" | null = null;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const s = spawnRef.current;
      const el = ghostRef.current;
      if (!s || !el) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const age = performance.now() - s.bornAt;
      if (age > s.ttlMs) {
        if (s.kind === "prize") showToast("It vanished… keep looking!");
        setActive(null);
        return;
      }
      const t = age / 1000;
      let x: number;
      let y = h * 0.42 + Math.sin(t * 2.2) * 16;
      let opacity = Math.min(1, age / 500, (s.ttlMs - age) / 700);

      if (s.kind === "flyby") {
        const p = age / s.ttlMs;
        x = -GHOST_PX + p * (w + GHOST_PX * 2);
        y = h * 0.55 - Math.sin(p * Math.PI) * h * 0.25;
        opacity = 1;
      } else if (s.yaw !== null && yawRef.current !== null) {
        const dx = wrap180(yawRef.current - s.yaw) * (w / FOV_DEG);
        x = w / 2 + dx + Math.sin(t * 0.9) * 18;
      } else {
        // No compass: let it drift across the view instead.
        x = w / 2 + Math.sin(t * 0.7) * w * 0.28;
      }

      const visible = x > -GHOST_PX / 2 && x < w + GHOST_PX / 2;
      posRef.current = { x, y, visible };
      el.style.transform = `translate(${x - GHOST_PX / 2}px, ${y - GHOST_PX / 2}px) rotate(${Math.sin(t * 1.6) * 6}deg)`;
      el.style.opacity = String(Math.max(0, opacity) * (s.kind === "prize" ? 1 : 0.92));

      const nextArrow = visible || s.kind === "flyby" ? null : x < 0 ? "left" : "right";
      if (nextArrow !== lastArrow) {
        lastArrow = nextArrow;
        setArrow(nextArrow);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [setActive, showToast]);

  /* photo: the camera frame with the ghost painted where it was */
  const capture = useCallback(
    async (s: Spawn | null, prizeLine: string | null): Promise<Blob | null> => {
      const v = videoRef.current;
      if (!v || !v.videoWidth) return null;
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      const sw = window.innerWidth;
      const sh = window.innerHeight;
      const scale = Math.max(sw / vw, sh / vh);
      const ox = (sw - vw * scale) / 2;
      const oy = (sh - vh * scale) / 2;

      const c = document.createElement("canvas");
      c.width = vw;
      c.height = vh;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(v, 0, 0, vw, vh);

      if (s && posRef.current.visible) {
        const size = GHOST_PX / scale;
        const gx = (posRef.current.x - ox) / scale;
        const gy = (posRef.current.y - oy) / scale;
        ctx.shadowColor = "rgba(190,160,255,.9)";
        ctx.shadowBlur = size * 0.25;
        ctx.drawImage(s.img, gx - size / 2, gy - size / 2, size, size * 1.1);
        ctx.shadowBlur = 0;
      }

      const band = Math.round(vh * 0.13);
      ctx.fillStyle = "rgba(20,10,40,.78)";
      ctx.fillRect(0, vh - band, vw, band);
      ctx.fillStyle = "#fff";
      ctx.textBaseline = "middle";
      const f1 = Math.round(band * 0.3);
      ctx.font = `900 ${f1}px Arial, sans-serif`;
      ctx.fillText(
        prizeLine || (s ? `I spotted ${s.character.name} at SharEat!` : "Ghost hunting at SharEat!"),
        band * 0.35,
        vh - band * 0.64
      );
      ctx.font = `700 ${Math.round(band * 0.22)}px Arial, sans-serif`;
      ctx.fillStyle = "#d8c8ff";
      ctx.fillText(`${status.hashtag}  ${status.tagHandle}`, band * 0.35, vh - band * 0.27);

      return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/jpeg", 0.9));
    },
    [status.hashtag, status.tagHandle]
  );

  const snap = useCallback(
    async (won: TicketData | null = null) => {
      const s = spawnRef.current;
      const blob = await capture(s, won ? `I caught ${s?.character.name ?? "a ghost"} and won ${won.prizeName}!` : null);
      if (!blob) return showToast("Camera not ready yet.");
      setPhoto({ url: URL.createObjectURL(blob), blob, won, name: s?.character.name ?? "" });
    },
    [capture, showToast]
  );

  const tapGhost = useCallback(async () => {
    const s = spawnRef.current;
    if (!s || catching) return;
    if (s.kind === "flyby") return showToast(pick(s.character.lines));
    if (s.kind === "hello") {
      setBubble(pick(s.character.lines));
      return;
    }
    if (tableHasWon) {
      setBubble("Your table already won today — but say cheese!");
      return;
    }
    setCatching(true);
    try {
      const res = await fetch("/api/customer/games/ghost-hunt/catch", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ spawnId: s.spawnId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        showToast(json?.error || "It slipped away!");
        setActive(null);
        return;
      }
      navigator.vibrate?.([120, 60, 220]);
      onWon(json.ticket);
      setBubble(pick(s.character.lines));
      await snap(json.ticket);
      setActive(null);
    } finally {
      setCatching(false);
    }
  }, [catching, tableHasWon, onWon, setActive, showToast, snap]);

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-black text-white">
      <style>{`@keyframes radar{0%{transform:scale(.6);opacity:.8}100%{transform:scale(2.2);opacity:0}}`}</style>
      <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />

      {camError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <Camera className="h-10 w-10 text-white/60" />
          <p className="text-sm">{camError}</p>
          <Button onClick={onClose} variant="secondary" className="rounded-2xl">Back</Button>
        </div>
      ) : null}

      {spawn && (
        <button
          key={spawn.key}
          ref={ghostRef}
          type="button"
          onClick={tapGhost}
          aria-label={`Tap ${spawn.character.name}`}
          className="absolute left-0 top-0 will-change-transform"
          style={{ width: GHOST_PX, height: GHOST_PX * 1.1, opacity: 0 }}
        >
          <img
            src={spawn.img.src}
            alt=""
            draggable={false}
            className="h-full w-full select-none"
            style={{
              filter:
                spawn.kind === "prize"
                  ? "drop-shadow(0 0 18px rgba(250,204,21,.95)) drop-shadow(0 0 40px rgba(190,160,255,.8))"
                  : "drop-shadow(0 0 14px rgba(190,160,255,.7))",
            }}
          />
          {bubble && (
            <span className="absolute -top-14 left-1/2 w-48 -translate-x-1/2 rounded-2xl bg-white px-3 py-2 text-center text-sm font-bold text-zinc-900 shadow-lg">
              {bubble}
            </span>
          )}
          {catching && <Loader2 className="absolute inset-0 m-auto h-10 w-10 animate-spin text-white" />}
        </button>
      )}

      {arrow && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 ${arrow === "left" ? "left-2" : "right-2"} flex animate-pulse flex-col items-center rounded-2xl bg-amber-400/90 px-2 py-3 text-zinc-900`}
        >
          {arrow === "left" ? <ChevronLeft className="h-8 w-8" /> : <ChevronRight className="h-8 w-8" />}
          <span className="text-[10px] font-black uppercase">Turn</span>
        </div>
      )}

      {/* top bar */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 text-sm font-bold">
          <span className="relative flex h-3 w-3">
            <span className="absolute inset-0 rounded-full bg-violet-400" style={{ animation: "radar 1.6s ease-out infinite" }} />
            <span className="relative h-3 w-3 rounded-full bg-violet-300" />
          </span>
          {spawn ? (spawn.kind === "prize" ? `A prize ${pack.noun}! Tap it!` : `${spawn.character.name} is here`) : `Looking for ${pack.noun}s…`}
        </div>
        <button type="button" onClick={onClose} aria-label="Close camera" className="rounded-full bg-black/40 p-2">
          <X className="h-6 w-6" />
        </button>
      </div>

      {toast && (
        <div className="absolute inset-x-6 top-20 rounded-2xl bg-black/70 px-4 py-3 text-center text-sm font-bold backdrop-blur">
          {toast}
        </div>
      )}

      {/* shutter */}
      {!camError && !photo && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-black/70 to-transparent pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-10">
          <button
            type="button"
            onClick={() => snap(null)}
            aria-label="Take a photo"
            className="h-[72px] w-[72px] rounded-full border-4 border-white bg-white/25 active:scale-95"
          />
          <p className="text-xs text-white/70">Slowly turn around · tap a {pack.noun} · snap a photo</p>
        </div>
      )}

      {photo && (
        <PhotoSheet
          photo={photo}
          pack={pack}
          hashtag={status.hashtag}
          tagHandle={status.tagHandle}
          onRetake={() => {
            URL.revokeObjectURL(photo.url);
            setPhoto(null);
          }}
          onShowTicket={onShowTicket}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- photo */

function PhotoSheet({
  photo,
  pack,
  hashtag,
  tagHandle,
  onRetake,
  onShowTicket,
}: {
  photo: { url: string; blob: Blob; won: TicketData | null; name: string };
  pack: Pack;
  hashtag: string;
  tagHandle: string;
  onRetake: () => void;
  onShowTicket: () => void;
}) {
  const caption = photo.won
    ? `I caught ${photo.name} at SharEat and won ${photo.won.prizeName}! 👻 ${hashtag} ${tagHandle}`
    : `${pack.noun === "ghost" ? "Ghost" : "Holiday"} hunting at SharEat! 👻 ${hashtag} ${tagHandle}`;
  const [copied, setCopied] = useState(false);
  const file = new File([photo.blob], "shareat-ghost-hunt.jpg", { type: "image/jpeg" });
  const canShareFile = typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] });

  const share = async () => {
    try {
      await navigator.clipboard?.writeText(caption).catch(() => {});
      await navigator.share({ files: [file], text: caption });
    } catch {}
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-zinc-950/95 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      {photo.won && (
        <div className="mb-3 rounded-2xl bg-amber-400 px-4 py-3 text-zinc-900">
          <p className="flex items-center gap-2 text-lg font-black"><Gift className="h-5 w-5" /> You won {photo.won.prizeName}!</p>
          <p className="text-xs font-semibold">Post this photo, tag {tagHandle}, then show the cashier.</p>
        </div>
      )}
      <img src={photo.url} alt="Your ghost photo" className="min-h-0 flex-1 rounded-2xl object-contain" />
      <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs text-white/80">{caption}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {canShareFile ? (
          <Button onClick={share} className="h-12 rounded-2xl bg-white font-black text-zinc-900 hover:bg-zinc-100">
            <Share2 className="mr-2 h-4 w-4" /> Share
          </Button>
        ) : (
          <Button asChild className="h-12 rounded-2xl bg-white font-black text-zinc-900 hover:bg-zinc-100">
            <a href={photo.url} download="shareat-ghost-hunt.jpg">
              <Download className="mr-2 h-4 w-4" /> Save photo
            </a>
          </Button>
        )}
        <Button
          variant="secondary"
          className="h-12 rounded-2xl font-bold"
          onClick={async () => {
            await navigator.clipboard?.writeText(caption).catch(() => {});
            setCopied(true);
          }}
        >
          <Copy className="mr-2 h-4 w-4" /> {copied ? "Copied!" : "Copy caption"}
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onRetake} className="h-11 rounded-2xl text-white hover:bg-white/10">
          <Ghost className="mr-2 h-4 w-4" /> Keep hunting
        </Button>
        {photo.won && (
          <Button onClick={onShowTicket} className="h-11 rounded-2xl bg-amber-400 font-black text-zinc-900 hover:bg-amber-300">
            <Ticket className="mr-2 h-4 w-4" /> Prize ticket
          </Button>
        )}
      </div>
    </div>
  );
}
