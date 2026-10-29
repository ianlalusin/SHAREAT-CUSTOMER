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

/**
 * Ghost Hunt event settings — chain-wide, admin only.
 *
 * To rerun it for Christmas: switch the theme, set new dates and prizes, save.
 * A branch can carry its own prizes, hours and socials (the second card);
 * its manager sets the cashier PIN under Manager → Ghost Hunt.
 */
export default function AdminGhostHuntPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [s, setS] = useState<GhostHuntSettings | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stores, setStores] = useState<{ storeId: string; name: string }[]>([]);
  /** Empty = every branch. */
  const [onlyAt, setOnlyAt] = useState<string[]>([]);

  const authed = useCallback(async () => {
    const user = getAuth().currentUser;
    if (!user) throw new Error("Not signed in.");
    return { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(getAuth(), async (user) => {
      if (!user) return router.push("/admin/login");
      try {
        const res = await fetch("/api/admin/games/ghost-hunt", { headers: await authed(), cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load.");
        setS(json.settings);
        setIsActive(!!json.isActive);
        setOnlyAt(json.applicableStoreIds || []);
        const st = await fetch("/api/admin/my-stores", { headers: await authed(), cache: "no-store" });
        const sj = await st.json().catch(() => ({}));
        if (st.ok && sj?.ok) setStores(sj.stores || []);
      } catch (e: any) {
        toast({ variant: "destructive", title: "Couldn't load", description: e?.message });
      }
    });
    return () => unsub();
  }, [router, authed, toast]);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/games/ghost-hunt", {
        method: "PUT",
        headers: await authed(),
        body: JSON.stringify({ isActive, settings: s, applicableStoreIds: onlyAt }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not save.");
      setS(json.settings);
      toast({ title: "Saved", description: isActive ? "The hunt runs inside its dates and hours." : "The hunt is off." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Couldn't save", description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  if (!s) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const set = (patch: Partial<GhostHuntSettings>) => setS({ ...s, ...patch });

  return (
    <main className="min-h-screen bg-zinc-50 p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <Button variant="ghost" onClick={() => router.push("/admin/games")} className="-ml-2 gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <Card className="rounded-[2rem] border-none bg-white shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl font-black">Spot a Ghost</CardTitle>
            <p className="text-sm text-muted-foreground">
              Turns itself off after the end date, even if the switch stays on.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between rounded-2xl border p-4">
              <div>
                <p className="font-bold">Running</p>
                <p className="text-xs text-muted-foreground">Every branch, unless a manager switches it off there.</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            <div className="space-y-2 rounded-2xl border p-4">
              <p className="font-bold">Branches</p>
              <p className="text-xs text-muted-foreground">
                {onlyAt.length === 0
                  ? "Every branch. Tick branches to run it only there — handy for a test run first."
                  : `Only at ${onlyAt.length} branch${onlyAt.length > 1 ? "es" : ""}. Untick all for every branch.`}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {stores.map((st) => {
                  const on = onlyAt.includes(st.storeId);
                  return (
                    <label key={st.storeId} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setOnlyAt(on ? onlyAt.filter((x) => x !== st.storeId) : [...onlyAt, st.storeId])
                        }
                      />
                      {st.name}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Theme</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["halloween", "christmas"] as GhostTheme[]).map((t) => (
                  <Button
                    key={t}
                    type="button"
                    variant={s.theme === t ? "default" : "outline"}
                    className="rounded-2xl capitalize"
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
              <Label>Hours ghosts come out (every day)</Label>
              <HoursEditor value={s.windows} onChange={(windows) => set({ windows })} />
            </div>

            <div className="space-y-2">
              <Label>Prizes — how many each branch gives away per day (unless the branch sets its own)</Label>
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
                hint="Only while today's prizes last."
                value={s.prizeShare}
                onChange={(v) => set({ prizeShare: v })}
              />
              <Odds
                label="Otherwise it says hi (the rest fly by)"
                value={s.helloShare}
                onChange={(v) => set({ helloShare: v })}
              />
              <p className="text-xs text-muted-foreground">
                About 1 prize ghost every {Math.max(1, Math.round(12 / Math.max(0.001, s.appearChance * s.prizeShare) / 60))}{" "}
                minutes of hunting, per phone.
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
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </CardContent>
        </Card>

        <BranchSettings stores={stores} chain={s} authed={authed} />
      </div>
    </main>
  );
}

type Overrides = Partial<Pick<GhostHuntSettings, "prizes" | "windows" | "hashtag" | "tagHandle">>;

/**
 * One branch's own prizes, hours and socials. Each part has its own switch:
 * off means the branch follows the chain settings above, so a later change
 * there still reaches it.
 */
function BranchSettings({
  stores,
  chain,
  authed,
}: {
  stores: { storeId: string; name: string }[];
  chain: GhostHuntSettings;
  authed: () => Promise<Record<string, string>>;
}) {
  const { toast } = useToast();
  const [storeId, setStoreId] = useState("");
  const [o, setO] = useState<Overrides | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!storeId) return setO(null);
    let cancelled = false;
    setO(null);
    (async () => {
      try {
        const res = await fetch(`/api/admin/games/ghost-hunt/branch?storeId=${encodeURIComponent(storeId)}`, {
          headers: await authed(),
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load.");
        if (!cancelled) setO(json.overrides || {});
      } catch (e: any) {
        toast({ variant: "destructive", title: "Couldn't load branch", description: e?.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, authed, toast]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/games/ghost-hunt/branch", {
        method: "PUT",
        headers: await authed(),
        body: JSON.stringify({ storeId, overrides: o }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not save.");
      setO(json.overrides);
      toast({ title: "Branch saved", description: stores.find((x) => x.storeId === storeId)?.name });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Couldn't save", description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  /** Switch a part between "own" (copy the chain's value to start from) and "follow chain". */
  const toggle = <K extends keyof Overrides>(key: K, own: boolean) => {
    if (!o) return;
    const next = { ...o };
    if (own) next[key] = chain[key] as Overrides[K];
    else delete next[key];
    setO(next);
  };

  return (
    <Card className="rounded-[2rem] border-none bg-white shadow-xl">
      <CardHeader>
        <CardTitle className="text-xl font-black">Per-branch settings</CardTitle>
        <p className="text-sm text-muted-foreground">
          Give a branch its own prizes, hours, hashtag or tagged account. Anything left on &quot;Same as above&quot;
          follows the settings above.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          className="h-11 w-full rounded-2xl border bg-white px-3 text-sm"
        >
          <option value="">Pick a branch…</option>
          {stores.map((st) => (
            <option key={st.storeId} value={st.storeId}>
              {st.name}
            </option>
          ))}
        </select>

        {storeId && !o && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {o && (
          <>
            <OwnPart label="Prizes and daily counts" own={!!o.prizes} onToggle={(v) => toggle("prizes", v)}>
              <PrizesEditor value={o.prizes ?? []} onChange={(prizes) => setO({ ...o, prizes })} />
            </OwnPart>
            <OwnPart label="Hours" own={!!o.windows} onToggle={(v) => toggle("windows", v)}>
              <HoursEditor value={o.windows ?? []} onChange={(windows) => setO({ ...o, windows })} />
            </OwnPart>
            <OwnPart label="Hashtag" own={o.hashtag !== undefined} onToggle={(v) => toggle("hashtag", v)}>
              <Input value={o.hashtag ?? ""} onChange={(e) => setO({ ...o, hashtag: e.target.value })} />
            </OwnPart>
            <OwnPart label="Tagged account" own={o.tagHandle !== undefined} onToggle={(v) => toggle("tagHandle", v)}>
              <Input value={o.tagHandle ?? ""} onChange={(e) => setO({ ...o, tagHandle: e.target.value })} />
            </OwnPart>
            <Button onClick={save} disabled={saving} className="h-12 w-full rounded-2xl font-black">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save branch"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function OwnPart({
  label,
  own,
  onToggle,
  children,
}: {
  label: string;
  own: boolean;
  onToggle: (own: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-bold">{label}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {own ? "Own for this branch" : "Same as above"}
          <Switch checked={own} onCheckedChange={onToggle} />
        </div>
      </div>
      {own && children}
    </div>
  );
}

function HoursEditor({ value, onChange }: { value: GhostWindow[]; onChange: (v: GhostWindow[]) => void }) {
  return (
    <div className="space-y-2">
      {value.map((w, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input type="time" value={w.start} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
          <span className="text-sm text-muted-foreground">to</span>
          <Input type="time" value={w.end} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
          <Button variant="ghost" size="icon" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => onChange([...value, { start: "17:00", end: "21:00" }])}>
        <Plus className="mr-1 h-4 w-4" /> Add hours
      </Button>
      {value.length === 0 && <p className="text-xs text-amber-700">No hours set: ghosts appear all day.</p>}
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
