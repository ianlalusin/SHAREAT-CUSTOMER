"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Camera, Download, Loader2, Minus, Plus, RefreshCw, Share2, SwitchCamera, Trash2, Type } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { waitForAuthUser } from "@/lib/auth-ready";
import { markView, signalUse } from "@/lib/games/trackGame";
import { CONSENT_TEXT, LAYOUTS, type Layout } from "@/lib/games/capture-share/layouts";
import { drawOverlays, grabFrame, loadImage, overlayBox, renderBase, renderFinal, type Overlay, type Shot } from "@/lib/games/capture-share/render";

const GAME_ID = "capture-share";
const EMOJIS = ["🥩", "🔥", "😋", "🤤", "❤️", "🎉", "🥳", "✨", "😎", "👑", "💯", "🍻", "😂", "🙌", "⭐", "🎂"];
const TEXT_COLORS = ["#ffffff", "#18181b", "#d62828", "#facc15"];

type Phase = "pick" | "shoot" | "edit" | "done";

async function authHeader(): Promise<Record<string, string>> {
  const user = await waitForAuthUser();
  return user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {};
}

/** A small to-scale drawing of the layout, for the picker. */
function LayoutThumb({ layout }: { layout: Layout }) {
  const H = 112;
  const k = H / layout.h;
  return (
    <div
      className="relative mx-auto bg-white shadow ring-1 ring-zinc-200"
      style={{ width: layout.w * k, height: H, transform: layout.tiltDeg ? `rotate(${layout.tiltDeg}deg)` : undefined }}
    >
      {layout.slots.map((s, i) => (
        <div
          key={i}
          className={cn("absolute bg-zinc-300", i > 0 && layout.id === "duo" && "bg-zinc-400 ring-2 ring-white")}
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
        total={layout.shots}
        aspect={layout.slots[shots.length]?.w / layout.slots[shots.length]?.h || 1}
        taken={shots.length}
        onShot={(s) => setShots((prev) => (prev.length < layout.shots ? [...prev, s] : prev))}
        onCancel={startOver}
      />
    );

  if (phase === "edit" && base)
    return (
      <Editor
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
  total,
  taken,
  aspect,
  onShot,
  onCancel,
}: {
  total: number;
  taken: number;
  aspect: number;
  onShot: (s: Shot) => void;
  onCancel: () => void;
}) {
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
      <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-3xl bg-black" style={{ aspectRatio: String(aspect) }}>
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
        {flash && <div className="absolute inset-0 bg-white" />}
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
  base,
  overlays,
  setOverlays,
  onRetake,
  onFinish,
}: {
  base: HTMLCanvasElement;
  overlays: Overlay[];
  setOverlays: React.Dispatch<React.SetStateAction<Overlay[]>>;
  onRetake: () => void;
  onFinish: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState<string | null>(null);
  const [textColor, setTextColor] = useState(TEXT_COLORS[0]);
  const drag = useRef<{ id: string; px: number; py: number } | null>(null);
  // Latest pointer position; applied once per animation frame so a drag does not redraw the full canvas per event.
  const pending = useRef<{ x: number; y: number } | null>(null);
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
    if (sel) {
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = Math.max(4, base.width / 250);
      ctx.setLineDash([16, 10]);
      const { halfW, halfH } = overlayBox(sel);
      ctx.strokeRect(sel.x - halfW, sel.y - halfH, halfW * 2, halfH * 2);
      ctx.setLineDash([]);
    }
  }, [base, overlays, selected]);

  const toCanvas = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * base.width, y: ((e.clientY - r.top) / r.height) * base.height };
  };

  const hit = (x: number, y: number) =>
    [...overlays].reverse().find((o) => {
      const { halfW, halfH } = overlayBox(o);
      return Math.abs(x - o.x) <= halfW && Math.abs(y - o.y) <= halfH;
    });

  const add = (kind: Overlay["kind"], text: string, color = "#000000") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const size = Math.round(base.width * (kind === "emoji" ? 0.14 : 0.08));
    setOverlays((o) => [...o, { id, kind, text, x: base.width / 2, y: base.height / 2, size, color }]);
    setSelected(id);
  };

  const resize = (k: number) =>
    setOverlays((os) => os.map((o) => (o.id === selected ? { ...o, size: Math.max(20, Math.min(base.width * 0.6, o.size * k)) } : o)));

  return (
    <div className="space-y-4">
      <canvas
        ref={canvasRef}
        className="mx-auto block max-h-[60vh] w-auto max-w-full touch-none rounded-2xl shadow-lg"
        onPointerDown={(e) => {
          const p = toCanvas(e);
          const o = hit(p.x, p.y);
          setSelected(o?.id ?? null);
          if (o) {
            drag.current = { id: o.id, px: p.x - o.x, py: p.y - o.y };
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          pending.current = toCanvas(e);
          if (frame.current !== null) return;
          frame.current = requestAnimationFrame(() => {
            frame.current = null;
            const d = drag.current;
            const p = pending.current;
            if (!d || !p) return;
            setOverlays((os) => os.map((o) => (o.id === d.id ? { ...o, x: p.x - d.px, y: p.y - d.py } : o)));
          });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
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
        <p className="text-center text-xs text-muted-foreground">Tap a sticker to add it. Drag to move, tap it to resize.</p>
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
  const sendConsented = useCallback(async () => {
    setSendState("sending");
    try {
      const res = await fetch("/api/customer/games/capture-share", {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "image/jpeg", "X-Photo-Id": photoId, "X-Layout": layoutId },
        body: blob,
      });
      setSendState(res.ok ? "sent" : "failed");
    } catch {
      setSendState("failed");
    }
  }, [blob, photoId, layoutId]);

  const onConsent = (v: boolean) => {
    // Once sent it cannot be unsent from here; the consent text says how to have it removed.
    if (sendState === "sent" || sendState === "sending") return;
    setConsent(v);
    if (v) void sendConsented();
    else setSendState("idle");
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
          Couldn&apos;t send it to SharEat.{" "}
          <button type="button" className="underline" onClick={() => void sendConsented()}>
            Try again
          </button>
        </p>
      )}

      {shareFailed && (
        <p className="text-xs font-semibold text-amber-700">Sharing didn&apos;t work. Save the photo, then post it from your gallery.</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-12 rounded-2xl font-bold" onClick={save}>
          <Download className="mr-2 h-4 w-4" /> Save
        </Button>
        {canShareFile ? (
          <Button className="h-12 rounded-2xl font-black" onClick={share}>
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
    </div>
  );
}

