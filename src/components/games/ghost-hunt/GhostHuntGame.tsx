"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { DEFAULT_ASPECT, packFor, pick, prizeCharacter, svgUrl, type Character, type Pack } from "./packs";
import { flightPose, randomFlight, type Flight } from "./flights";
import { PrizeTicket, type TicketData } from "./PrizeTicket";
import { listPhotos, savePhoto, type SavedPhoto } from "./photoStore";
import { fitCaption } from "@/lib/games/ghost-hunt/caption";

const GAME_ID = "ghost-hunt";
const TICKET_KEY = "shareat_ghost_ticket";

type Status = {
  live: boolean;
  message: string | null;
  theme: string;
  hours: string;
  endsAtMs: number;
  prizes: { id: string; name: string }[];
  /** What is still uncaught today at this branch. Null away from a table. */
  remaining: { id: string; name: string; left: number }[] | null;
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
  /** Fly-bys only: which path, and from which side. */
  flight?: Flight;
  /** On-screen sprite size, from the art's shape. */
  w: number;
  h: number;
};

/** Sprite size for a character: ghosts are upright, a sleigh team is wide. */
function spriteSize(c: Character): { w: number; h: number } {
  const aspect = c.aspect ?? DEFAULT_ASPECT;
  const h = aspect > 1.5 ? 120 : aspect > 1 ? 150 : GHOST_PX * 1.1;
  return { w: h * aspect, h };
}

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
  /**
   * Whether THIS table session already won. Not the same as having a ticket:
   * the phone keeps an earlier visit's ticket so it can still be shown at the
   * counter, and treating that as "this table won" blocked every later visit
   * from the same phone. The server's answer (status.ticket) is per session;
   * a catch made on this screen counts too until the next reload.
   */
  const [wonThisVisit, setWonThisVisit] = useState(false);
  const [photos, setPhotos] = useState<SavedPhoto[]>([]);
  const [viewing, setViewing] = useState<SavedPhoto | null>(null);

  const pack = packFor(status?.theme || "halloween");
  const tableHasWon = !!status?.ticket || wonThisVisit;

  const refreshPhotos = useCallback(() => {
    listPhotos().then(setPhotos);
  }, []);
  useEffect(refreshPhotos, [refreshPhotos]);

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

  // A saved photo opened from the hunt screen or the ticket, outside the camera.
  const viewer = viewing && (
    <div className="fixed inset-0 z-[100]">
      <PhotoSheet
        photo={viewing}
        tagHandle={status.tagHandle}
        closeLabel="Close"
        onClose={() => setViewing(null)}
        onShowTicket={
          ticket
            ? () => {
                setViewing(null);
                setPhase("ticket");
              }
            : undefined
        }
      />
    </div>
  );

  if (phase === "ticket" && ticket) {
    const prizePhoto = photos.find((p) => p.catchId === ticket.catchId) ?? photos.find((p) => p.prizeName) ?? null;
    return (
      <>
        <PrizeTicket
          ticket={ticket}
          pack={pack}
          hashtag={status.hashtag}
          tagHandle={status.tagHandle}
          onChange={setTicket}
          onBack={() => setPhase("intro")}
          onSharePhoto={prizePhoto ? () => setViewing(prizePhoto) : null}
        />
        {viewer}
      </>
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
        tableHasWon={tableHasWon}
        onStart={start}
        onTicket={() => setPhase("ticket")}
      />
      <div className="mt-4">
        <PhotoStrip photos={photos} onOpen={setViewing} />
      </div>
      {viewer}
      {(phase === "hunting" || phase === "photo") && (
        <Hunt
          status={status}
          pack={pack}
          tableHasWon={tableHasWon}
          onClose={() => {
            setPhase("intro");
            load();
          }}
          onWon={(t) => {
            setTicket(t);
            setWonThisVisit(true);
            try {
              localStorage.setItem(TICKET_KEY, t.catchId);
            } catch {}
          }}
          onShowTicket={() => setPhase("ticket")}
          onEnded={(msg) => {
            setStatus((s) => (s ? { ...s, live: false, message: msg } : s));
            setPhase("intro");
          }}
          onPhotoSaved={refreshPhotos}
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
  tableHasWon,
  onStart,
  onTicket,
}: {
  status: Status;
  pack: Pack;
  ticket: TicketData | null;
  tableHasWon: boolean;
  onStart: () => void;
  onTicket: () => void;
}) {
  const hero = pack.prizeFallback[0];
  // Caught counts as gone, claimed or not — so this flips the moment the last one is caught.
  const allCaught = !!status.remaining && status.remaining.length > 0 && status.remaining.every((r) => r.left === 0);
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
              tableHasWon ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-violet-900 hover:bg-violet-50"
            }`}
          >
            <Camera className="mr-2 h-5 w-5" />
            {tableHasWon ? "Keep hunting for fun" : "Open camera & hunt"}
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
          <p className="font-black">{status.remaining ? "Prizes left today" : "Prizes"}</p>
          {allCaught && (
            <p className="mt-2 rounded-2xl bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-900">
              All of today&apos;s prizes have been caught. The {pack.noun}s still say hi — try again tomorrow!
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3">
            {status.prizes.map((p, i) => {
              const c = prizeCharacter(pack, p.id, i);
              const left = status.remaining?.find((r) => r.id === p.id)?.left;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 rounded-2xl bg-zinc-50 p-2 ${left === 0 ? "opacity-50 grayscale" : ""}`}
                >
                  <img src={svgUrl(c.svg)} alt="" className="h-12 w-12 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-tight">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {left === undefined ? `from ${c.name}` : left === 0 ? "All caught" : `${left} left · ${c.name}`}
                    </p>
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
  onPhotoSaved,
}: {
  status: Status;
  pack: Pack;
  tableHasWon: boolean;
  onClose: () => void;
  onWon: (t: TicketData) => void;
  onShowTicket: () => void;
  onEnded: (message: string) => void;
  onPhotoSaved: () => void;
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
  const [photo, setPhoto] = useState<SavedPhoto | null>(null);

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
        ttlMs = 0;
        offset = 0;
      }
      const flight = r.kind === "flyby" ? randomFlight() : undefined;
      if (flight) ttlMs = flight.ms;
      setActive({
        ...spriteSize(character),
        flight,
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
      let tilt = Math.sin(t * 1.6) * 6;
      let flip = false;

      if (s.flight) {
        const pose = flightPose(s.flight, age / s.ttlMs, w, h, s.w);
        x = pose.x;
        y = pose.y;
        tilt = pose.tilt;
        flip = pose.facingLeft;
        opacity = 1;
      } else if (s.yaw !== null && yawRef.current !== null) {
        const dx = wrap180(yawRef.current - s.yaw) * (w / FOV_DEG);
        x = w / 2 + dx + Math.sin(t * 0.9) * 18;
      } else {
        // No compass: let it drift across the view instead.
        x = w / 2 + Math.sin(t * 0.7) * w * 0.28;
      }

      const visible = x > -s.w / 2 && x < w + s.w / 2;
      posRef.current = { x, y, visible };
      el.style.transform = `translate(${x - s.w / 2}px, ${y - s.h / 2}px) rotate(${tilt}deg)`;
      // Mirror the art only, so a speech bubble on the button never reads backwards.
      const art = el.firstElementChild as HTMLElement | null;
      if (art) art.style.transform = flip ? "scaleX(-1)" : "";
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
        const sw2 = s.w / scale;
        const sh2 = s.h / scale;
        const gx = (posRef.current.x - ox) / scale;
        const gy = (posRef.current.y - oy) / scale;
        ctx.shadowColor = "rgba(190,160,255,.9)";
        ctx.shadowBlur = sh2 * 0.2;
        ctx.drawImage(s.img, gx - sw2 / 2, gy - sh2 / 2, sw2, sh2);
        ctx.shadowBlur = 0;
      }

      // The caption shrinks and wraps to fit (lib/games/ghost-hunt/caption.ts):
      // a long prize name used to run off the edge, hiding the prize itself.
      const unit = Math.round(vh * 0.13);
      const pad = unit * 0.35;
      const maxW = vw - pad * 2;
      const headline = prizeLine || (s ? `I spotted ${s.character.name} at SharEat!` : "Ghost hunting at SharEat!");
      const measure = (text: string, px: number) => {
        ctx.font = `900 ${px}px Arial, sans-serif`;
        return ctx.measureText(text).width;
      };
      const sizes = [0.3, 0.27, 0.24, 0.21, 0.18].map((k) => Math.round(unit * k));
      const fit = fitCaption(measure, headline, maxW, sizes);
      const lineH = fit.px * 1.15;
      const tagPx = Math.round(unit * 0.2);
      const band = Math.round(pad * 0.8 + fit.lines.length * lineH + tagPx * 1.4 + pad * 0.6);

      ctx.fillStyle = "rgba(20,10,40,.78)";
      ctx.fillRect(0, vh - band, vw, band);
      ctx.textBaseline = "top";
      ctx.fillStyle = "#fff";
      ctx.font = `900 ${fit.px}px Arial, sans-serif`;
      fit.lines.forEach((line, i) => ctx.fillText(line, pad, vh - band + pad * 0.8 + i * lineH));
      ctx.font = `700 ${tagPx}px Arial, sans-serif`;
      ctx.fillStyle = "#d8c8ff";
      const tags = `${status.hashtag}  ${status.tagHandle}`;
      ctx.fillText(tags, pad, vh - band + pad * 0.8 + fit.lines.length * lineH + tagPx * 0.3, maxW);

      return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/jpeg", 0.9));
    },
    [status.hashtag, status.tagHandle]
  );

  const snap = useCallback(
    async (won: TicketData | null = null) => {
      const s = spawnRef.current;
      const blob = await capture(s, won ? `I caught ${s?.character.name ?? "a ghost"} and won ${won.prizeName}!` : null);
      if (!blob) return showToast("Camera not ready yet.");
      const name = s?.character.name ?? "";
      const saved: SavedPhoto = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        blob,
        caption: photoCaption(pack, name, won?.prizeName ?? null, status.hashtag, status.tagHandle),
        catchId: won?.catchId ?? null,
        prizeName: won?.prizeName ?? null,
        name,
        atMs: Date.now(),
      };
      // Saved before it is shown: a share that fails must not cost them the photo.
      await savePhoto(saved);
      onPhotoSaved();
      setPhoto(saved);
    },
    [capture, showToast, pack, status.hashtag, status.tagHandle, onPhotoSaved]
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
          style={{ width: spawn.w, height: spawn.h, opacity: 0 }}
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
          tagHandle={status.tagHandle}
          closeLabel="Keep hunting"
          onClose={() => setPhoto(null)}
          onShowTicket={onShowTicket}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- photo */

function photoCaption(pack: Pack, name: string, prizeName: string | null, hashtag: string, tagHandle: string) {
  return prizeName
    ? `I caught ${name || `a ${pack.noun}`} at SharEat and won ${prizeName}! 👻 ${hashtag} ${tagHandle}`
    : `${pack.noun === "ghost" ? "Ghost" : "Holiday"} hunting at SharEat! 👻 ${hashtag} ${tagHandle}`;
}

/**
 * One photo, ready to post. It is already saved on the phone by the time this
 * opens, so closing it — or a share sheet that fails — loses nothing: it is
 * waiting under "Your photos" and on the prize ticket.
 */
function PhotoSheet({
  photo,
  tagHandle,
  closeLabel,
  onClose,
  onShowTicket,
}: {
  photo: SavedPhoto;
  tagHandle: string;
  closeLabel: string;
  onClose: () => void;
  onShowTicket?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const url = useMemo(() => URL.createObjectURL(photo.blob), [photo.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const file = useMemo(() => new File([photo.blob], "shareat-ghost-hunt.jpg", { type: "image/jpeg" }), [photo.blob]);
  const canShareFile = typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] });

  const share = async () => {
    setShareFailed(false);
    await navigator.clipboard?.writeText(photo.caption).catch(() => {});
    try {
      await navigator.share({ files: [file], text: photo.caption });
    } catch (e: any) {
      // Dismissing the sheet is not a failure worth a message; anything else is.
      if (e?.name !== "AbortError") setShareFailed(true);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-zinc-950/95 p-4 pt-[max(1rem,env(safe-area-inset-top))] text-white">
      {photo.prizeName && (
        <div className="mb-3 rounded-2xl bg-amber-400 px-4 py-3 text-zinc-900">
          <p className="flex items-center gap-2 text-lg font-black"><Gift className="h-5 w-5" /> You won {photo.prizeName}!</p>
          <p className="text-xs font-semibold">Post this photo, tag {tagHandle}, then show the cashier.</p>
        </div>
      )}
      <img src={url} alt="Your ghost photo" className="min-h-0 flex-1 rounded-2xl object-contain" />
      <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs text-white/80">{photo.caption}</p>
      {shareFailed && (
        <p className="mt-2 text-xs font-semibold text-amber-300">
          Sharing didn&apos;t work. Save the photo, then post it from your gallery — the caption is copied.
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {canShareFile ? (
          <Button onClick={share} className="h-12 rounded-2xl bg-white font-black text-zinc-900 hover:bg-zinc-100">
            <Share2 className="mr-2 h-4 w-4" /> Share
          </Button>
        ) : null}
        <Button asChild variant={canShareFile ? "secondary" : "default"} className="h-12 rounded-2xl font-bold">
          <a href={url} download="shareat-ghost-hunt.jpg">
            <Download className="mr-2 h-4 w-4" /> Save photo
          </a>
        </Button>
        <Button
          variant="secondary"
          className={`h-12 rounded-2xl font-bold ${canShareFile ? "col-span-2" : ""}`}
          onClick={async () => {
            await navigator.clipboard?.writeText(photo.caption).catch(() => {});
            setCopied(true);
          }}
        >
          <Copy className="mr-2 h-4 w-4" /> {copied ? "Caption copied!" : "Copy caption"}
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose} className="h-11 rounded-2xl text-white hover:bg-white/10">
          <Ghost className="mr-2 h-4 w-4" /> {closeLabel}
        </Button>
        {photo.catchId && onShowTicket && (
          <Button onClick={onShowTicket} className="h-11 rounded-2xl bg-amber-400 font-black text-zinc-900 hover:bg-amber-300">
            <Ticket className="mr-2 h-4 w-4" /> Prize ticket
          </Button>
        )}
      </div>
    </div>
  );
}

/** Thumbnails of the photos saved on this phone. Tap to share again. */
function PhotoStrip({ photos, onOpen }: { photos: SavedPhoto[]; onOpen: (p: SavedPhoto) => void }) {
  const urls = useMemo(() => photos.map((p) => URL.createObjectURL(p.blob)), [photos]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  if (!photos.length) return null;
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <p className="font-black">Your photos</p>
      <p className="text-xs text-muted-foreground">Saved on this phone. Tap one to share it again.</p>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {photos.map((p, i) => (
          <button key={p.id} type="button" onClick={() => onOpen(p)} className="relative shrink-0">
            <img src={urls[i]} alt="" className="h-24 w-24 rounded-2xl object-cover" />
            {p.prizeName && (
              <span className="absolute bottom-1 left-1 rounded-lg bg-amber-400 px-1.5 text-[10px] font-black text-zinc-900">PRIZE</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
