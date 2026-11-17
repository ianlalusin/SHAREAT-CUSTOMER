"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { GhostHuntSettings, GhostPrize, GhostTheme, GhostWindow } from "@/lib/games/ghost-hunt/rules";

/** A UTC instant as the value of a Manila `datetime-local` input. */
function toLocalInput(ms: number): string {
  return new Date(ms + 8 * 3600_000).toISOString().slice(0, 16);
}
function fromLocalInput(v: string): number {
  return Date.parse(`${v}:00+08:00`);
}

const pct = (n: number) => Math.round(n * 100);

type BranchRow = {
  storeId: string;
  name: string;
  enabled: boolean;
  runningNow: boolean;
  status: string;
  theme: GhostTheme;
  startsAtMs: number;
  endsAtMs: number;
  prizesPerDay: number;
};

const fmtDay = (ms: number) =>
  new Date(ms).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" });

/**
 * Ghost Hunt settings — PER BRANCH ONLY, admin only.
 *
 * There are no chain-wide settings: every branch has its own on/off, theme,
 * dates, hours, prizes, odds and socials (lib/games/ghost-hunt/branches.ts).
 * To rerun it for Christmas, set each branch's theme, dates and prizes.
 * Each branch's manager sets its cashier PIN under Manager → Ghost Hunt.
 */
export default function AdminGhostHuntPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [rows, setRows] = useState<BranchRow[] | null>(null);
  const [storeId, setStoreId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [s, setS] = useState<GhostHuntSettings | null>(null);
  const [saving, setSaving] = useState(false);

  const authed = useCallback(async () => {
    const user = getAuth().currentUser;
    if (!user) throw new Error("Not signed in.");
    return { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" };
  }, []);

  const loadRows = useCallback(async () => {
    const res = await fetch("/api/admin/games/ghost-hunt", { headers: await authed(), cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load.");
    setRows(json.branches || []);
  }, [authed]);

  useEffect(() => {
    const unsub = onAuthStateChanged(getAuth(), (user) => {
      if (!user) return router.push("/admin/login");
      loadRows().catch((e: any) => toast({ variant: "destructive", title: "Couldn't load", description: e?.message }));
    });
    return () => unsub();
  }, [router, loadRows, toast]);

  useEffect(() => {
    if (!storeId) return setS(null);
    let cancelled = false;
    setS(null);
    (async () => {
      try {
        const res = await fetch(`/api/admin/games/ghost-hunt/branch?storeId=${encodeURIComponent(storeId)}`, {
          headers: await authed(),
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load.");
        if (cancelled) return;
        setEnabled(!!json.enabled);
        setS(json.settings);
      } catch (e: any) {
        toast({ variant: "destructive", title: "Couldn't load branch", description: e?.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, authed, toast]);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/games/ghost-hunt/branch", {
        method: "PUT",
        headers: await authed(),
        body: JSON.stringify({ storeId, enabled, settings: s }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not save.");
      setS(json.settings);
      setEnabled(!!json.enabled);
      await loadRows();
      const name = rows?.find((r) => r.storeId === storeId)?.name ?? "Branch";
      toast({ title: `${name} saved`, description: json.enabled ? "On, inside its own dates and hours." : "Off at this branch." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Couldn't save", description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const set = (patch: Partial<GhostHuntSettings>) => s && setS({ ...s, ...patch });
  const current = rows?.find((r) => r.storeId === storeId);

  return (
    <main className="min-h-screen bg-zinc-50 p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <Button variant="ghost" onClick={() => router.push("/admin/games")} className="-ml-2 gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <Card className="rounded-[2rem] border-none bg-white shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl font-black">Catch the Christmas & Share — branches</CardTitle>
            <p className="text-sm text-muted-foreground">
              Every branch has its own settings. Tap a branch to change it. A branch turns itself off after its end
              date, even if it is switched on.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows === null ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              rows.map((r) => (
                <button
                  key={r.storeId}
                  type="button"
                  onClick={() => setStoreId(r.storeId)}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition ${
                    storeId === r.storeId ? "border-primary bg-primary/5" : "hover:bg-zinc-50"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-bold">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.enabled
                        ? `${r.theme === "christmas" ? "🎅" : "👻"} ${fmtDay(r.startsAtMs)} – ${fmtDay(r.endsAtMs)} · ${r.prizesPerDay} prizes/day`
                        : "Off"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                      r.runningNow
                        ? "bg-emerald-100 text-emerald-800"
                        : r.enabled
                          ? "bg-amber-100 text-amber-800"
                          : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {r.runningNow ? "Running now" : r.enabled ? "On" : "Off"}
                  </span>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {storeId && !s && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {s && (
          <Card className="rounded-[2rem] border-none bg-white shadow-xl">
            <CardHeader>
              <CardTitle className="text-xl font-black">{current?.name ?? "Branch"}</CardTitle>
              {current && current.enabled && !current.runningNow && (
                <p className="text-sm text-amber-700">{current.status}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between rounded-2xl border p-4">
                <div>
                  <p className="font-bold">Running at this branch</p>
                  <p className="text-xs text-muted-foreground">Inside the dates and hours below.</p>
                </div>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>

              <div className="space-y-2">
                <Label>Theme</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["halloween", "christmas"] as GhostTheme[]).map((t) => (
                    <Button
                      key={t}
                      type="button"
                      variant={s.theme === t ? "default" : "outline"}
                      className="rounded-2xl"
                      onClick={() => set({ theme: t })}
                    >
                      {t === "halloween" ? "👻 Halloween" : "🎅 Christmas"}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Starts (Manila)</Label>
                  <Input
                    type="datetime-local"
                    value={toLocalInput(s.startsAtMs)}
                    onChange={(e) => e.target.value && set({ startsAtMs: fromLocalInput(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Ends (Manila)</Label>
                  <Input
                    type="datetime-local"
                    value={toLocalInput(s.endsAtMs)}
                    onChange={(e) => e.target.value && set({ endsAtMs: fromLocalInput(e.target.value) })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Hours characters come out (every day)</Label>
                <HoursEditor value={s.windows} onChange={(windows) => set({ windows })} defaultPrizeShare={s.prizeShare} />
              </div>

              <div className="space-y-2">
                <Label>Prizes — how many this branch gives away per day</Label>
                <PrizesEditor value={s.prizes} onChange={(prizes) => set({ prizes })} />
              </div>

              <div className="space-y-3 rounded-2xl bg-zinc-50 p-4">
                <p className="text-sm font-bold">How often things appear</p>
                <Odds
                  label="A scan finds something"
                  hint="A phone scans about every 10–14 seconds while the camera is open."
                  value={s.appearChance}
                  onChange={(v) => set({ appearChance: v })}
                />
                <Odds
                  label="…and it is a prize ghost"
                  hint="Only when this branch still has a prize available right now."
                  value={s.prizeShare}
                  onChange={(v) => set({ prizeShare: v })}
                />
                <Odds label="Otherwise it says hi (the rest fly by)" value={s.helloShare} onChange={(v) => set({ helloShare: v })} />
                <p className="text-xs text-muted-foreground">
                  {(() => {
                    const mins = Math.max(1, Math.round(12 / Math.max(0.001, s.appearChance * s.prizeShare) / 60));
                    return `About 1 prize ghost every ${mins === 1 ? "minute" : `${mins} minutes`} of hunting, per phone, while a prize is available.`;
                  })()}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Hashtag</Label>
                  <Input value={s.hashtag} onChange={(e) => set({ hashtag: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Tag this account</Label>
                  <Input value={s.tagHandle} onChange={(e) => set({ tagHandle: e.target.value })} />
                </div>
              </div>

              <Button onClick={save} disabled={saving} className="h-12 w-full rounded-2xl font-black">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Save ${current?.name ?? "branch"}`}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

/**
 * The daily time slots, each with two optional dials (blank = default):
 *   - share of prizes: how much of the day's prizes this slot unlocks, so a
 *     branch can save most for the dinner rush;
 *   - prize ghost %: this slot's own prize chance, so winning can be easier
 *     at the busiest hours.
 */
function HoursEditor({
  value,
  onChange,
  defaultPrizeShare,
}: {
  value: GhostWindow[];
  onChange: (v: GhostWindow[]) => void;
  defaultPrizeShare: number;
}) {
  const patch = (i: number, p: Partial<GhostWindow>) => onChange(value.map((x, j) => (j === i ? { ...x, ...p } : x)));
  /** A 0–100 box ↔ a 0–1 field; empty means "not set". */
  const pctField = (v: number | undefined) => (typeof v === "number" ? String(Math.round(v * 100)) : "");
  const fromPct = (s: string) => (s.trim() === "" ? undefined : Math.min(100, Math.max(0, Number(s) || 0)) / 100);
  const sharesSet = value.filter((w) => typeof w.share === "number");
  const shareTotal = Math.round(sharesSet.reduce((s, w) => s + (w.share as number), 0) * 100);

  return (
    <div className="space-y-2">
      {value.map((w, i) => (
        <div key={i} className="space-y-2 rounded-2xl border p-3">
          <div className="flex items-center gap-2">
            <Input type="time" value={w.start} onChange={(e) => patch(i, { start: e.target.value })} />
            <span className="text-sm text-muted-foreground">to</span>
            <Input type="time" value={w.end} onChange={(e) => patch(i, { end: e.target.value })} />
            <Button variant="ghost" size="icon" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-muted-foreground">
              Share of prizes
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="auto"
                  className="h-9"
                  value={pctField(w.share)}
                  onChange={(e) => patch(i, { share: fromPct(e.target.value) })}
                />
                <span>%</span>
              </div>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              Prize ghost %
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder={String(Math.round(defaultPrizeShare * 100))}
                  className="h-9"
                  value={pctField(w.prizeShare)}
                  onChange={(e) => patch(i, { prizeShare: fromPct(e.target.value) })}
                />
                <span>%</span>
              </div>
            </label>
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => onChange([...value, { start: "17:00", end: "21:00" }])}>
        <Plus className="mr-1 h-4 w-4" /> Add hours
      </Button>
      {value.length === 0 && <p className="text-xs text-amber-700">No hours set: characters appear all day.</p>}
      <p className="text-xs text-muted-foreground">
        Blank share = prizes spread evenly by the clock. Blank prize ghost % = the branch&apos;s prize ghost % below.
      </p>
      {sharesSet.length > 0 && sharesSet.length === value.length && shareTotal !== 100 && (
        <p className="text-xs text-amber-700">
          Shares add up to {shareTotal}%. They are used in proportion, so this still works — but 100% is easiest to read.
        </p>
      )}
    </div>
  );
}

function PrizesEditor({ value, onChange }: { value: GhostPrize[]; onChange: (v: GhostPrize[]) => void }) {
  return (
    <div className="space-y-2">
      {value.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={p.name} placeholder="Prize name" onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <Input
            type="number"
            min={0}
            max={99}
            className="w-20"
            value={p.perDay}
            onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, perDay: Number(e.target.value) || 0 } : x)))}
          />
          <Button variant="ghost" size="icon" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => onChange([...value, { id: "", name: "", perDay: 1 }])}>
        <Plus className="mr-1 h-4 w-4" /> Add prize
      </Button>
      <p className="text-xs text-muted-foreground">
        Total per day: {value.reduce((a, p) => a + (p.perDay || 0), 0)}. One prize per table per visit. A caught prize counts
        as gone right away, even before the cashier gives it.
      </p>
    </div>
  );
}

function Odds({ label, hint, value, onChange }: { label: string; hint?: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">{label}</span>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={0}
            max={100}
            className="h-9 w-20 text-right"
            value={pct(value)}
            onChange={(e) => onChange(Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100)}
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
