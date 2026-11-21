"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Camera, Download, Loader2, Minus, Plus, RefreshCw, Share2, SwitchCamera, Trash2, Type } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { waitForAuthUser } from "@/lib/auth-ready";
import { markView, signalUse } from "@/lib/games/trackGame";
import { CONSENT_TEXT, LAYOUTS, footerBox, keepClear, rotatedExtents, type Layout } from "@/lib/games/capture-share/layouts";
import { drawOverlays, grabFrame, loadImage, overlayBox, renderBase, renderFinal, type Overlay, type Shot } from "@/lib/games/capture-share/render";

const GAME_ID = "capture-share";
const EMOJIS = ["🥩", "🔥", "😋", "🤤", "❤️", "🎉", "🥳", "✨", "😎", "👑", "💯", "🍻", "😂", "🙌", "⭐", "🎂"];
const TEXT_COLORS = ["#ffffff", "#18181b", "#d62828", "#facc15"];

type Phase = "pick" | "shoot" | "edit" | "done";

async function authHeader(): Promise<Record<string, string>> {
  const user = await waitForAuthUser();
  return user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {};
}

/** A small to-scale drawing of the layout. With `progress`, shows shots taken (green) and the next one (pulsing). */
function LayoutThumb({ layout, height = 112, progress }: { layout: Layout; height?: number; progress?: number }) {
  const H = height;
  const k = H / layout.h;
  return (
    <div
      className="relative mx-auto bg-white shadow ring-1 ring-zinc-200"
      style={{ width: layout.w * k, height: H, transform: layout.tiltDeg ? `rotate(${layout.tiltDeg}deg)` : undefined }}
    >
      {layout.slots.map((s, i) => (
        <div
          key={i}
          className={cn(
            "absolute bg-zinc-300",
            i > 0 && layout.id === "duo" && "bg-zinc-400 ring-2 ring-white",
            progress !== undefined && i < progress && "bg-emerald-400",
            progress === i && "animate-pulse bg-primary"
          )}
          style={{ left: s.x * k, top: s.y * k, width: s.w * k, height: s.h * k }}
        />
      ))}
      <div
        className="absolute rounded-sm bg-primary/30"
        style={{ left: layout.footer.x * k, top: layout.footer.y * k, width: layout.footer.w * k * 0.25, height: layout.footer.h * k }}
      />
    </div>
  );
}

export function CaptureShareGame() {
  const [storeName, setStoreName] = useState<string | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [layout, setLayout] = useState<Layout | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [base, setBase] = useState<HTMLCanvasElement | null>(null);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [finalBlob, setFinalBlob] = useState<Blob | null>(null);

  useEffect(() => {
    markView(GAME_ID);
    (async () => {
      try {
        const res = await fetch("/api/customer/games/capture-share", { headers: await authHeader(), cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not open Capture & Share.");
        setStoreName(String(json.storeName || "SharEat"));
      } catch (e) {
        setGateError((e as Error)?.message || "Could not open Capture & Share.");
      }
    })();
  }, []);

  const startOver = () => {
    setShots([]);
    setBase(null);
    setOverlays([]);
    setFinalBlob(null);
    setPhase("pick");
  };

  // Build the collage once the last photo is in.
  useEffect(() => {
    if (!layout || storeName === null || shots.length !== layout.shots) return;
    let cancelled = false;
    (async () => {
      const logo = await loadImage("/icons/logo.png").catch(() => null);
      if (cancelled) return;
      setBase(renderBase(layout, shots, storeName, format(new Date(), "MMM d, yyyy"), logo));
      setPhase("edit");
    })();
    return () => {
      cancelled = true;
    };
  }, [layout, shots, storeName]);

  if (gateError) return <p className="rounded-2xl bg-amber-50 px-4 py-6 text-center text-sm text-amber-900">{gateError}</p>;
  if (storeName === null)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );

  if (phase === "pick")
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Pick a layout, then strike a pose.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => {
                setLayout(l);
                setShots([]);
                setPhase("shoot");
              }}
              className="flex flex-col items-center gap-3 rounded-3xl bg-white p-4 pt-6 shadow-md transition hover:shadow-lg active:scale-[0.98]"
            >
              <LayoutThumb layout={l} />
              <span className="text-sm font-bold">{l.label}</span>
              <span className="-mt-2 text-xs text-muted-foreground">
                {l.shots} photo{l.shots > 1 ? "s" : ""}
              </span>
            </button>
          ))}
        </div>
      </div>
    );

  if (phase === "shoot" && layout)
    return (
      <Shooter
        layout={layout}
        taken={shots.length}
        onShot={(s) => setShots((prev) => (prev.length < layout.shots ? [...prev, s] : prev))}
        onCancel={startOver}
      />
    );

  if (phase === "edit" && base && layout)
    return (
      <Editor
        layout={layout}
        base={base}
        overlays={overlays}
        setOverlays={setOverlays}
        onRetake={() => {
          setShots([]);
          setBase(null);
          setOverlays([]);
          setPhase("shoot");
        }}
        onFinish={async () => {
          const blob = await renderFinal(base, overlays);
          if (blob) {
            setFinalBlob(blob);
            setPhase("done");
          }
        }}
      />
    );

  if (phase === "done" && finalBlob && layout)
    return <Finished blob={finalBlob} layoutId={layout.id} onEdit={() => setPhase("edit")} onNew={startOver} />;

  return null;
}

/* ─── Camera ──────────────────────────────────────────────────────────────── */

function Shooter({
  layout,
  taken,
  onShot,
  onCancel,
}: {
  layout: Layout;
  taken: number;
  onShot: (s: Shot) => void;
  onCancel: () => void;
}) {
  const total = layout.shots;
  // The preview box has the exact shape of the slot being filled, and the
  // collage crops the frame the same way (centre, cover), so what is inside
  // the white frame is exactly what ends up in the photo.
  const slot = layout.slots[Math.min(taken, total - 1)];
  const aspect = slot.w / slot.h;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [front, setFront] = useState(true);
  const [camError, setCamError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: front ? "user" : "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e) {
        setCamError(
          (e as Error)?.name === "NotAllowedError"
            ? "Camera is blocked. Allow camera access for this site in your browser settings, then try again."
            : "Could not open the camera on this phone."
        );
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [front]);

  // 3-2-1 countdown, then grab the frame.
  useEffect(() => {
    if (count === null) return;
    if (count > 0) {
      const t = setTimeout(() => setCount(count - 1), 1000);
      return () => clearTimeout(t);
    }
    const v = videoRef.current;
    setCount(null);
    if (!v || !v.videoWidth) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    onShot(grabFrame(v, front));
  }, [count, front, onShot]);

  if (camError)
    return (
      <div className="space-y-3 text-center">
        <p className="rounded-2xl bg-amber-50 px-4 py-6 text-sm text-amber-900">{camError}</p>
        <Button variant="outline" onClick={onCancel}>Back to layouts</Button>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm font-bold">
        <span>Photo {Math.min(taken + 1, total)} of {total}</span>
        <button type="button" className="text-muted-foreground underline" onClick={onCancel}>Change layout</button>
      </div>
      <div className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm">
        <LayoutThumb layout={{ ...layout, tiltDeg: undefined }} height={56} progress={taken} />
        <p className="text-xs text-muted-foreground">Only what&apos;s inside the white frame goes in your photo.</p>
      </div>
      <div
        className="mx-auto rounded-md bg-white p-3 pb-10 shadow-xl ring-1 ring-zinc-200"
        style={{ width: `min(100%, calc(55vh * ${aspect}) + 1.5rem)` }}
      >
      <div className="relative w-full overflow-hidden bg-black" style={{ aspectRatio: String(aspect) }}>
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
          style={{ transform: front ? "scaleX(-1)" : undefined }}
        />
        {count !== null && count > 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-8xl font-black text-white drop-shadow-lg">{count}</div>
        )}
        {/* Corner marks: the frame edge, even against a dark or busy background. */}
        {["left-2 top-2 border-l-4 border-t-4", "right-2 top-2 border-r-4 border-t-4", "bottom-2 left-2 border-b-4 border-l-4", "bottom-2 right-2 border-b-4 border-r-4"].map((c) => (
          <span key={c} className={cn("pointer-events-none absolute h-7 w-7 border-white/90", c)} />
        ))}
        {flash && <div className="absolute inset-0 bg-white" />}
      </div>
      </div>
      <div className="flex items-center justify-center gap-6">
        <Button variant="outline" size="icon" className="h-12 w-12 rounded-full" onClick={() => setFront((f) => !f)} aria-label="Switch camera">
          <SwitchCamera className="h-5 w-5" />
        </Button>
        <button
          type="button"
          disabled={count !== null || taken >= total}
          onClick={() => setCount(3)}
          aria-label="Take photo"
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-primary bg-white shadow-lg active:scale-95 disabled:opacity-50"
        >
          <Camera className="h-8 w-8 text-primary" />
        </button>
        <div className="h-12 w-12" />
      </div>
    </div>
  );
}

/* ─── Stickers & text ─────────────────────────────────────────────────────── */

function Editor({
  layout,
  base,
  overlays,
  setOverlays,
  onRetake,
  onFinish,
}: {
  layout: Layout;
  base: HTMLCanvasElement;
  overlays: Overlay[];
  setOverlays: React.Dispatch<React.SetStateAction<Overlay[]>>;
  onRetake: () => void;
  onFinish: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;
  const [textDraft, setTextDraft] = useState<string | null>(null);
  const [textColor, setTextColor] = useState(TEXT_COLORS[0]);

  // The logo + caption strip. No sticker may sit on it (owner's call: the branding stays readable).
  const block = useMemo(() => footerBox(layout), [layout]);
  const maxSize = base.width * 0.6;

  /** Keep a sticker inside the picture and off the logo + caption, however it was moved, sized or turned. */
  const constrain = useCallback(
    (o: Overlay): Overlay => {
      const { halfW, halfH } = overlayBox(o);
      const { ex, ey } = rotatedExtents(halfW, halfH, o.rot);
      return { ...o, ...keepClear(o.x, o.y, ex, ey, { w: base.width, h: base.height }, block) };
    },
    [base, block]
  );

  // Rotate handle: a dot above the sticker that turns with it.
  const handleR = base.width * 0.035;
  const handleAt = (o: Overlay) => {
    const d = overlayBox(o).halfH + handleR * 2.2;
    return { x: o.x + Math.sin(o.rot) * d, y: o.y - Math.cos(o.rot) * d };
  };

  // Every finger on the canvas, and what the current gesture started from.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  type Gesture =
    | { mode: "move"; id: string; dx: number; dy: number }
    | { mode: "rotate"; id: string; startAngle: number; startRot: number }
    | { mode: "pinch"; id: string; startDist: number; startAngle: number; startSize: number; startRot: number };
  const gesture = useRef<Gesture | null>(null);
  // Applied once per animation frame so a drag does not redraw the full canvas per event.
  const frame = useRef<number | null>(null);
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  // Redraw the preview canvas (same pixels as the export) on every change.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = base.width;
    c.height = base.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(base, 0, 0);
    drawOverlays(ctx, overlays);
    const sel = overlays.find((o) => o.id === selected);
    if (!sel) return;
    const { halfW, halfH } = overlayBox(sel);
    const d = halfH + handleR * 2.2;
    ctx.save();
    ctx.translate(sel.x, sel.y);
    ctx.rotate(sel.rot);
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = Math.max(4, base.width / 250);
    ctx.setLineDash([16, 10]);
    ctx.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, -halfH);
    ctx.lineTo(0, -d + handleR);
    ctx.stroke();
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.arc(0, -d, handleR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 " + Math.round(handleR * 1.3) + "px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("↻", 0, -d);
    ctx.restore();
  }, [base, overlays, selected, handleR]);

  const toCanvas = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * base.width, y: ((e.clientY - r.top) / r.height) * base.height };
  };

  const hit = (x: number, y: number) =>
    [...overlays].reverse().find((o) => {
      // Into the sticker's own (unrotated) frame, then a plain box test.
      const dx = x - o.x;
      const dy = y - o.y;
      const lx = dx * Math.cos(-o.rot) - dy * Math.sin(-o.rot);
      const ly = dx * Math.sin(-o.rot) + dy * Math.cos(-o.rot);
      const { halfW, halfH } = overlayBox(o);
      return Math.abs(lx) <= halfW && Math.abs(ly) <= halfH;
    });

  const add = (kind: Overlay["kind"], text: string, color = "#000000") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const size = Math.round(base.width * (kind === "emoji" ? 0.14 : 0.08));
    setOverlays((o) => [...o, constrain({ id, kind, text, x: base.width / 2, y: base.height / 2, size, minSize: size, rot: 0, color })]);
    setSelected(id);
  };

  const resize = (k: number) =>
    setOverlays((os) => os.map((o) => (o.id === selected ? constrain({ ...o, size: Math.max(o.minSize, Math.min(maxSize, o.size * k)) }) : o)));

  const startPinch = (id: string) => {
    const [a, b] = [...pointers.current.values()];
    const o = overlays.find((x) => x.id === id);
    if (!o || !a || !b) return;
    gesture.current = {
      mode: "pinch",
      id,
      startDist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      startAngle: Math.atan2(b.y - a.y, b.x - a.x),
      startSize: o.size,
      startRot: o.rot,
    };
  };

  const applyGesture = () => {
    frame.current = null;
    const g = gesture.current;
    if (!g) return;
    const pts = [...pointers.current.values()];
    setOverlays((os) =>
      os.map((o) => {
        if (o.id !== g.id) return o;
        if (g.mode === "move" && pts[0]) return constrain({ ...o, x: pts[0].x - g.dx, y: pts[0].y - g.dy });
        if (g.mode === "rotate" && pts[0]) {
          const angle = Math.atan2(pts[0].y - o.y, pts[0].x - o.x);
          return constrain({ ...o, rot: g.startRot + angle - g.startAngle });
        }
        if (g.mode === "pinch" && pts.length >= 2) {
          const [a, b] = pts;
          const size = Math.max(o.minSize, Math.min(maxSize, (g.startSize * Math.hypot(b.x - a.x, b.y - a.y)) / g.startDist));
          return constrain({ ...o, size, rot: g.startRot + Math.atan2(b.y - a.y, b.x - a.x) - g.startAngle });
        }
        return o;
      })
    );
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    // Lifting one finger of a pinch ends it, so the sticker does not jump to the remaining finger.
    if (pointers.current.size < 2 && gesture.current?.mode === "pinch") gesture.current = null;
    if (pointers.current.size === 0) gesture.current = null;
  };

  return (
    <div className="space-y-4">
      <canvas
        ref={canvasRef}
        className="mx-auto block max-h-[60vh] w-auto max-w-full touch-none rounded-2xl shadow-lg"
        onPointerDown={(e) => {
          const p = toCanvas(e);
          try {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          } catch {
            /* capture is a nicety (keeps a drag alive past the edge); the gesture works without it */
          }
          pointers.current.set(e.pointerId, p);

          // Second finger while a sticker is selected: pinch to size (and twist to turn).
          if (pointers.current.size === 2 && selectedRef.current) return startPinch(selectedRef.current);
          if (pointers.current.size !== 1) return;

          const sel = overlays.find((o) => o.id === selectedRef.current);
          if (sel) {
            const h = handleAt(sel);
            if (Math.hypot(p.x - h.x, p.y - h.y) <= handleR * 1.8) {
              gesture.current = { mode: "rotate", id: sel.id, startAngle: Math.atan2(p.y - sel.y, p.x - sel.x), startRot: sel.rot };
              return;
            }
          }
          const o = hit(p.x, p.y);
          if (o) {
            setSelected(o.id);
            gesture.current = { mode: "move", id: o.id, dx: p.x - o.x, dy: p.y - o.y };
            return;
          }
          // A touch off every sticker keeps the current one selected (a pinch often starts with
          // one finger beside it); the Done button deselects.
          gesture.current = null;
        }}
        onPointerMove={(e) => {
          if (!pointers.current.has(e.pointerId)) return;
          pointers.current.set(e.pointerId, toCanvas(e));
          if (gesture.current && frame.current === null) frame.current = requestAnimationFrame(applyGesture);
        }}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      />

      {selected ? (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="icon" onClick={() => resize(0.85)} aria-label="Smaller"><Minus className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => resize(1.18)} aria-label="Bigger"><Plus className="h-4 w-4" /></Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setOverlays((os) => os.filter((o) => o.id !== selected));
              setSelected(null);
            }}
            aria-label="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={() => setSelected(null)}>Done</Button>
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground">Tap a sticker to add it. Drag to move. With one selected: pinch to resize, drag the blue ↻ dot to rotate.</p>
      )}

      <div className="grid grid-cols-8 gap-1">
        {EMOJIS.map((em) => (
          <button key={em} type="button" className="rounded-xl py-1 text-2xl hover:bg-zinc-100 active:scale-90" onClick={() => add("emoji", em)}>
            {em}
          </button>
        ))}
      </div>

      {textDraft === null ? (
        <Button variant="outline" className="w-full" onClick={() => setTextDraft("")}>
          <Type className="mr-2 h-4 w-4" /> Add text
        </Button>
      ) : (
        <div className="space-y-2 rounded-2xl bg-white p-3 shadow">
          <input
            autoFocus
            maxLength={40}
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            placeholder="Say something…"
            className="w-full rounded-xl border px-3 py-2 text-base"
          />
          <div className="flex items-center gap-2">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                onClick={() => setTextColor(c)}
                className={cn("h-8 w-8 rounded-full ring-1 ring-zinc-300", textColor === c && "ring-4 ring-primary")}
                style={{ background: c }}
              />
            ))}
            <div className="flex-1" />
            <Button variant="ghost" onClick={() => setTextDraft(null)}>Cancel</Button>
            <Button
              disabled={!textDraft.trim()}
              onClick={() => {
                add("text", textDraft.trim(), textColor);
                setTextDraft(null);
              }}
            >
              Add
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-12 rounded-2xl" onClick={onRetake}>
          <RefreshCw className="mr-2 h-4 w-4" /> Retake
        </Button>
        <Button
          className="h-12 rounded-2xl font-black"
          onClick={() => {
            setSelected(null);
            onFinish();
          }}
        >
          Finish
        </Button>
      </div>
    </div>
  );
}

/* ─── Save, share, consent ────────────────────────────────────────────────── */

function Finished({ blob, layoutId, onEdit, onNew }: { blob: Blob; layoutId: string; onEdit: () => void; onNew: () => void }) {
  const [consent, setConsent] = useState(false);
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const [shareFailed, setShareFailed] = useState(false);
  // Remounts per finished photo (phase change), so one id per version the diner saved.
  const [photoId] = useState(() => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const file = useMemo(() => new File([blob], "shareat-capture.jpg", { type: "image/jpeg" }), [blob]);
  const canShareFile = typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] });

  // Only a photo the diner agreed we may post is ever stored. Sent the moment
  // they tick the box (not tied to Save/Share), and the result is shown, so a
  // guest never believes they consented when nothing reached us.
  // Retried a few times: a phone on mobile data can drop a ~0.5MB upload that small requests survive.
  // The server treats a repeat of the same photo id as a no-op, so a retry never stores it twice.
  const sendConsented = useCallback(async () => {
    setSendState("sending");
    setSendError(null);
    const body = await blob.arrayBuffer();
    let reason = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, attempt * 1500));
      try {
        const res = await fetch("/api/customer/games/capture-share", {
          method: "POST",
          headers: { ...(await authHeader()), "Content-Type": "image/jpeg", "X-Photo-Id": photoId, "X-Layout": layoutId },
          body,
        });
        if (res.ok) return setSendState("sent");
        const json = await res.json().catch(() => ({}));
        reason = String(json?.error || `Server said ${res.status}`);
        if (res.status < 500 && res.status !== 429) break; // a refusal, not a hiccup: retrying will not change it
      } catch (e) {
        reason = `No connection (${(e as Error)?.message || "network error"})`;
      }
    }
    setSendError(reason);
    setSendState("failed");
  }, [blob, photoId, layoutId]);

  const onConsent = (v: boolean) => {
    // Once sent it cannot be unsent from here; the consent text says how to have it removed.
    if (sendState === "sent" || sendState === "sending") return;
    setConsent(v);
    if (v) void sendConsented();
    else setSendState("idle");
  };

  // Asked once per photo, on the first Save or Share, if the box is not already ticked. Either answer
  // carries on with what they tapped: the photo is theirs regardless, so consent stays a free choice.
  const [asked, setAsked] = useState(false);
  const [pending, setPending] = useState<"save" | "share" | null>(null);
  const askFirst = (action: "save" | "share") => {
    if (asked || consent || sendState === "sent" || sendState === "sending") return action === "save" ? save() : void share();
    setPending(action);
  };
  const answer = (yes: boolean) => {
    const action = pending;
    setPending(null);
    setAsked(true);
    if (yes) onConsent(true);
    if (action === "save") save();
    if (action === "share") void share();
  };

  const save = () => {
    signalUse(GAME_ID);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shareat-${format(new Date(), "yyyyMMdd-HHmmss")}.jpg`;
    a.click();
  };

  const share = async () => {
    setShareFailed(false);
    signalUse(GAME_ID);
    try {
      await navigator.share({ files: [file], text: "#Sharelebrate at SharEat" });
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setShareFailed(true);
    }
  };

  return (
    <div className="space-y-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- blob / signed URL, nothing for next/image to optimise */}
      <img src={url} alt="Your photo" className="mx-auto max-h-[60vh] rounded-2xl shadow-lg" />

      <label className="flex items-start gap-3 rounded-2xl bg-white p-4 text-sm shadow">
        <Checkbox checked={consent} onCheckedChange={(v) => onConsent(v === true)} className="mt-0.5" />
        <span>{CONSENT_TEXT}</span>
      </label>
      {sendState === "sending" && <p className="-mt-2 text-xs text-muted-foreground">Sending to SharEat…</p>}
      {sendState === "sent" && <p className="-mt-2 text-xs font-semibold text-emerald-700">Thanks! SharEat has your photo.</p>}
      {sendState === "failed" && (
        <p className="-mt-2 text-xs font-semibold text-amber-700">
          Couldn&apos;t send it to SharEat{sendError ? ` — ${sendError}` : ""}.{" "}
          <button type="button" className="underline" onClick={() => void sendConsented()}>
            Try again
          </button>
        </p>
      )}

      {shareFailed && (
        <p className="text-xs font-semibold text-amber-700">Sharing didn&apos;t work. Save the photo, then post it from your gallery.</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-12 rounded-2xl font-bold" onClick={() => askFirst("save")}>
          <Download className="mr-2 h-4 w-4" /> Save
        </Button>
        {canShareFile ? (
          <Button className="h-12 rounded-2xl font-black" onClick={() => askFirst("share")}>
            <Share2 className="mr-2 h-4 w-4" /> Share
          </Button>
        ) : (
          <Button variant="outline" className="h-12 rounded-2xl" onClick={onNew}>New photo</Button>
        )}
      </div>
      <div className="flex justify-center gap-6 text-sm">
        <button type="button" className="text-muted-foreground underline" onClick={onEdit}>Edit stickers</button>
        {canShareFile && (
          <button type="button" className="text-muted-foreground underline" onClick={onNew}>New photo</button>
        )}
      </div>
      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Can SharEat feature your photo?</AlertDialogTitle>
            <AlertDialogDescription>
              {/* Same wording as the checkbox: it is what the server stores as the consent given. */}
              {CONSENT_TEXT} Your photo saves either way.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={() => answer(false)}>No thanks</AlertDialogCancel>
            <AlertDialogAction onClick={() => answer(true)}>Yes, feature me!</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

