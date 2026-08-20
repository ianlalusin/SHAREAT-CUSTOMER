"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { CenterAlert } from "./CenterAlert";

import { getAuth } from "firebase/auth";
import { useFirebase } from "@/firebase";
import { formatCountdown } from "@/lib/refill-cooldown";

export type RefillCooldowns = {
  cooldownMs: number;
  /** refillId -> epoch ms when that refill becomes orderable again. */
  nextAllowedAt: Record<string, number>;
};

type StoreRefill = {
  id?: string;
  refillId: string;
  refillName: string;
  isOther?: boolean;
  kitchenLocationId?: string | null; // present in your POS, not required here
  kitchenLocationName?: string | null;
  isEnabled: boolean;
  sortOrder?: number;
};

type Refill = {
  id: string;
  isActive: boolean;
  requiresFlavor?: boolean;
  allowedFlavorIds?: string[];
};

type StoreFlavor = {
  id?: string;
  flavorId: string;
  flavorName: string;
  isEnabled: boolean;
};

type StorePackage = {
  packageName?: string;
  name?: string;
  refillsAllowed?: string[];
};

type CustomerSession = {
  id: string;
  storeId: string;
  tableId: string;
  tableDisplayName?: string;
  tableNumber?: string;
  packageOfferingId: string;
  packageSnapshot?: { name?: string };
  sessionMode?: string;
  initialFlavorIds?: string[];
  status?: string;
};

type CartItem = {
  refill: StoreRefill;
  flavorIds: string[];
  notes: string;
};

const OTHER_REFILLS_ID = "__OTHER_REFILLS__";

export function CustomerRefillModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: CustomerSession;
  sessionIsLocked?: boolean;
  refillCooldowns?: RefillCooldowns | null;
  onCooldownsChange?: (cooldowns: RefillCooldowns) => void;
}) {
  const isMobile = useIsMobile();
  const handleOpenChange = (open: boolean) => {
    if (!open) props.onOpenChange(false);
  };

  const content = (
    <CustomerRefillContent
      session={props.session}
      sessionIsLocked={props.sessionIsLocked}
      refillCooldowns={props.refillCooldowns}
      onCooldownsChange={props.onCooldownsChange}
      onClose={() => props.onOpenChange(false)}
    />
  );

  if (isMobile) {
    return (
      <Drawer open={props.open} onOpenChange={handleOpenChange}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Order Refill</DrawerTitle>
            <DrawerDescription>Choose 1 flavor per meat. Each meat can be refilled every 10 minutes.</DrawerDescription>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl p-0 gap-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle>Order Refill</DialogTitle>
          <DialogDescription>Choose 1 flavor per meat. Each meat can be refilled every 10 minutes.</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

function CustomerRefillContent({
  session,
  sessionIsLocked,
  refillCooldowns,
  onCooldownsChange,
  onClose,
}: {
  session: CustomerSession;
  sessionIsLocked?: boolean;
  refillCooldowns?: RefillCooldowns | null;
  onCooldownsChange?: (cooldowns: RefillCooldowns) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  
  const [storeRefills, setStoreRefills] = useState<StoreRefill[]>([]);
  const [globalRefills, setGlobalRefills] = useState<Refill[]>([]);
  const [storeFlavors, setStoreFlavors] = useState<StoreFlavor[]>([]);
  const [currentPackage, setCurrentPackage] = useState<StorePackage | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [cart, setCart] = useState<Map<string, CartItem>>(new Map());
  const [activeRefillId, setActiveRefillId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertState, setAlertState] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: "",
    message: "",
  });
  const [otherQty, setOtherQty] = useState<Record<string, number>>({});

  // refillId -> epoch ms when that refill unlocks again. Seeded from the
  // dashboard so the list never flashes "available" before our own fetch lands.
  const [nextAllowedAt, setNextAllowedAt] = useState<Record<string, number>>(
    () => refillCooldowns?.nextAllowedAt ?? {}
  );
  const [cooldownMs, setCooldownMs] = useState(() => refillCooldowns?.cooldownMs ?? 0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const applyCooldowns = (next: Record<string, number>, nextCooldownMs?: number) => {
    const ms = nextCooldownMs ?? cooldownMs;
    if (nextCooldownMs && nextCooldownMs !== cooldownMs) setCooldownMs(nextCooldownMs);
    setNextAllowedAt(next);
    onCooldownsChange?.({ cooldownMs: ms, nextAllowedAt: next });
  };

  const remainingFor = (refillId: string) => Math.max(0, (nextAllowedAt[refillId] ?? 0) - nowMs);

  // Tick only while something is actually counting down.
  const hasActiveCooldown = Object.values(nextAllowedAt).some((at) => at > nowMs);
  useEffect(() => {
    if (!hasActiveCooldown) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasActiveCooldown]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        if (!session?.storeId) {
          setIsLoading(false);
          return;
        }

        setIsLoading(true);

        const user = getAuth().currentUser;
        if (!user) {
          setIsLoading(false);
          return;
        }

        const idToken = await user.getIdToken();

        const res = await fetch("/api/customer/refill-options", {
          method: "GET",
          headers: { Authorization: `Bearer ${idToken}` },
        });

        const json = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to load refill options.");
        }

        if (cancelled) return;

        setStoreRefills(Array.isArray(json.storeRefills) ? json.storeRefills : []);
        setGlobalRefills(Array.isArray(json.refills) ? json.refills : []);
        setStoreFlavors(Array.isArray(json.storeFlavors) ? json.storeFlavors : []);
        setCurrentPackage(json.currentPackage ?? null);
        if (json.refillCooldowns?.nextAllowedAt) {
          setNowMs(Date.now());
          applyCooldowns(
            json.refillCooldowns.nextAllowedAt as Record<string, number>,
            Number(json.refillCooldowns.cooldownMs) || undefined
          );
        }
        setIsLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        setIsLoading(false);
        toast({
          title: "Unable to load refills",
          description: e?.message ?? "Please approach our staff.",
          variant: "destructive",
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [session.storeId, session.packageOfferingId]);

  const filteredRefills = useMemo(() => {
    let available = storeRefills;
    if (currentPackage?.refillsAllowed?.length) {
      const allowed = new Set(currentPackage.refillsAllowed);
      available = available.filter((r) => allowed.has(r.refillId));
    }
    return available;
  }, [storeRefills, currentPackage]);

  const otherRefills = useMemo(() => {
    return (storeRefills || [])
      .filter(r => !!r.isOther && r.isEnabled !== false)
      .sort((x, y) => (Number(x.sortOrder || 0) - Number(y.sortOrder || 0)) || String(x.refillName||"").localeCompare(String(y.refillName||"")));
  }, [storeRefills]);

  const mainRefills = useMemo(() => filteredRefills.filter(r => !r.isOther), [filteredRefills]);

  const activeCartItem = activeRefillId ? cart.get(activeRefillId) : null;
  const activeGlobalRefill = activeCartItem ? globalRefills.find((r) => r.id === activeCartItem.refill.refillId) : null;

  const sortedAllowedFlavors = useMemo(() => {
    if (!activeCartItem) return [];
    const globalInfo = globalRefills.find((r) => r.id === activeCartItem.refill.refillId);
    if (!globalInfo?.requiresFlavor) return [];

    const globallyAllowed = new Set(globalInfo.allowedFlavorIds || []);
    const storeEnabled = new Set(storeFlavors.map((f) => f.flavorId));

    const finalAllowed =
      globallyAllowed.size === 0
        ? storeEnabled
        : new Set([...globallyAllowed].filter((id) => storeEnabled.has(id)));

    const allowedStore = storeFlavors.filter((f) => finalAllowed.has(f.flavorId));

    const initial = new Set(session.initialFlavorIds || []);
    return allowedStore.sort((a, b) => {
      const aInit = initial.has(a.flavorId);
      const bInit = initial.has(b.flavorId);
      if (aInit && !bInit) return -1;
      if (!aInit && bInit) return 1;
      return a.flavorName.localeCompare(b.flavorName);
    });
  }, [activeCartItem, storeFlavors, globalRefills, session.initialFlavorIds]);

  const needsFlavors = !!activeGlobalRefill?.requiresFlavor && sortedAllowedFlavors.length > 0;
  const initialFlavorIdSet = useMemo(() => new Set(session.initialFlavorIds || []), [session.initialFlavorIds]);

  const handleSelectRefill = (refill: StoreRefill) => {
    const id = refill.refillId;
    if (remainingFor(id) > 0) return; // still cooling down — the row is disabled

    setCart((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, { refill, flavorIds: [], notes: "" });
      return next;
    });

    // toggle active panel: if you tapped the active one again, close it
    setActiveRefillId((cur) => (cur === id ? null : id));
  };

  const handleSelectOtherRefills = () => {
    setActiveRefillId((cur) => (cur === OTHER_REFILLS_ID ? null : OTHER_REFILLS_ID));
  };

  /**
   * One flavor per meat: picking another flavor replaces the current one, and
   * picking the selected one again clears it. There is no "too many flavors"
   * state to warn about because a second flavor can never be held.
   */
  const handleFlavorSelect = (flavorId: string) => {
    if (!activeRefillId) return;
    setCart((prev) => {
      const next = new Map(prev);
      const item = next.get(activeRefillId);
      if (!item) return prev;

      const isSelected = item.flavorIds[0] === flavorId;
      next.set(activeRefillId, { ...item, flavorIds: isSelected ? [] : [flavorId] });
      return next;
    });
  };

  const handleNotesChange = (notes: string) => {
    if (!activeRefillId) return;
    setCart((prev) => {
      const next = new Map(prev);
      const item = next.get(activeRefillId);
      if (!item) return prev;
      next.set(activeRefillId, { ...item, notes });
      return next;
    });
  };

  const defaultFlavorNames = useMemo(() => {
    return (session.initialFlavorIds || [])
      .map((id) => storeFlavors.find((f) => f.flavorId === id)?.flavorName)
      .filter(Boolean)
      .join(", ");
  }, [session.initialFlavorIds, storeFlavors]);

  async function submitCart() {
    if (sessionIsLocked) {
      toast({ variant: "destructive", title: "Session Locked", description: "Refills are disabled." });
      return;
    }
    const hasOther = Object.values(otherQty).some((v) => Number(v || 0) > 0);
    if (cart.size === 0 && !hasOther) {
      setAlertState({
        open: true,
        title: "Empty order",
        message: "Please select at least one refill before sending the order.",
      });
      return;
    }

    // validate each cart item — flavor is required when the global refill
    // says so. (Previously this also checked sortedAllowedFlavors.length > 0,
    // but that is scoped to the active refill in the side panel and would
    // skip validation of *other* cart items.)
    for (const item of cart.values()) {
      const globalInfo = globalRefills.find((r) => r.id === item.refill.refillId);
      if (globalInfo?.requiresFlavor && item.flavorIds.length === 0) {
        setActiveRefillId(item.refill.refillId);
        setAlertState({
          open: true,
          title: "Flavor required",
          message: `Please choose a flavor for "${item.refill.refillName}" before sending the order.`,
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Session expired. Please re-enter your PIN.");

      const idToken = await user.getIdToken();

      const items = Array.from(cart.values()).map((item) => {
        // Flavors no longer ride along in `notes` — the server resolves them from
        // flavorIds into the ticket's own `flavorNote`, which is what the KDS
        // card renders. Duplicating them here would print the flavor twice.
        const notes = item.notes.trim();

        return {
          // server accepts itemId/itemName too (it will fallback to refillId/refillName)
          itemId: item.refill.refillId,
          itemName: item.refill.refillName,
          refillId: item.refill.refillId,
          refillName: item.refill.refillName,

          kitchenLocationId: item.refill.kitchenLocationId || "",
          kitchenLocationName: item.refill.kitchenLocationName || "Kitchen",

          qty: 1,
          notes,
          // Sent so the server can enforce the 1-flavor-per-meat rule and write
          // a real flavorNote on the ticket — `notes` alone is not verifiable.
          flavorIds: item.flavorIds,
        };
      });

      const otherStation = otherRefills.find((r) => !!r.kitchenLocationId) || otherRefills[0];

      if (hasOther) {
        const byStation = new Map<
          string,
          { name?: string | null; entries: Array<[string, number]>; ids: string[] }
        >();

        for (const r of otherRefills) {
          const qty = Number(otherQty[r.refillId] || 0);
          if (qty <= 0) continue;
          if (remainingFor(r.refillId) > 0) continue; // still cooling down
          const stationId = String(r.kitchenLocationId || "");
          if (!stationId) continue;

          const bucket = byStation.get(stationId) || { name: r.kitchenLocationName, entries: [], ids: [] };
          bucket.name = bucket.name || r.kitchenLocationName;
          bucket.entries.push([r.refillName, qty]);
          bucket.ids.push(r.refillId);
          byStation.set(stationId, bucket);
        }

        for (const [stationId, bucket] of byStation.entries()) {
          items.push({
            itemId: "OTHER_REFILLS",
            itemName: "OTHER REFILLS",
            refillId: "OTHER_REFILLS",
            refillName: "OTHER REFILLS",
            kitchenLocationId: stationId,
            kitchenLocationName: bucket.name || "Kitchen",
            qty: 1,
            notes: "",
            refillRequest: Object.fromEntries(bucket.entries),
            // Each side item gets its own cooldown, same per-type rule as meats.
            refillIds: bucket.ids,
          } as any);
        }
      }

      const res = await fetch("/api/customer/submit-refill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ items }),
      });

      const json = (await res.json().catch(() => ({}))) as any;

      if (res.status === 429) {
        // Server is the authority on the countdown — resync and show why.
        const blocked: Array<{ refillId: string; nextAllowedAtMs: number }> = Array.isArray(json?.blocked)
          ? json.blocked
          : [];
        if (blocked.length) {
          const merged = { ...nextAllowedAt };
          for (const b of blocked) merged[b.refillId] = b.nextAllowedAtMs;
          setNowMs(Date.now());
          applyCooldowns(merged);
        }
        setAlertState({
          open: true,
          title: "Still cooling down",
          message: json?.error || "That refill isn't available yet.",
        });
        return;
      }

      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to submit refill.");

      if (json.refillCooldowns?.nextAllowedAt) {
        setNowMs(Date.now());
        applyCooldowns(
          json.refillCooldowns.nextAllowedAt as Record<string, number>,
          Number(json.refillCooldowns.cooldownMs) || undefined
        );
      }

      toast({ title: `Sent ${items.length} refill(s).`, description: "Status: Preparing" });
      setCart(new Map());
      setActiveRefillId(null);
      setOtherQty({});
      onClose();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed", description: e?.message ?? "Unknown error" });
    } finally {
      setIsSubmitting(false);
    }
  }

  function closeAndReset() {
    setCart(new Map());
    setActiveRefillId(null);
    setOtherQty({});
    onClose();
  }

  return (
    <div className="h-[70vh] flex flex-col">
      <CenterAlert
        open={alertState.open}
        title={alertState.title}
        message={alertState.message}
        onClose={() => setAlertState((s) => ({ ...s, open: false }))}
      />
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 overflow-y-auto">
        {/* Left: refills list */}
        <div className="md:col-span-1 border-r pr-4 flex flex-col">
          <h3 className="font-semibold mb-2">1. Select Refills</h3>
          <ScrollArea className="flex-1">
            {/* Two cards per row: Pork | Beef, Chicken | Seafood, then Other Refills. */}
            <div className="grid grid-cols-2 gap-2">
              {isLoading ? (
                <Loader2 className="col-span-2 mx-auto my-16 animate-spin" />
              ) : (
                mainRefills.map((refill) => {
                  const selected = cart.has(refill.refillId);
                  const remainingMs = remainingFor(refill.refillId);
                  const cooling = remainingMs > 0;
                  return (
                    <button
                      key={refill.refillId}
                      type="button"
                      disabled={cooling}
                      aria-label={
                        cooling
                          ? `${refill.refillName} — available again in ${formatCountdown(remainingMs)}`
                          : refill.refillName
                      }
                      onClick={() => handleSelectRefill(refill)}
                      className={cn(
                        "relative flex min-h-[76px] flex-col items-center justify-center gap-1",
                        "rounded-2xl border px-3 py-4 text-center transition-all",
                        cooling
                          ? "bg-muted text-muted-foreground border-muted-foreground/20 cursor-not-allowed"
                          : cn(
                              "hover:shadow-sm active:scale-[0.99]",
                              selected
                                ? "bg-primary text-white border-primary"
                                : "bg-white text-primary border-primary/30"
                            )
                      )}
                    >
                      <span className="font-black text-base leading-tight break-words">
                        {refill.refillName}
                      </span>
                      {cooling ? (
                        <span className="font-mono text-xs tabular-nums">{formatCountdown(remainingMs)}</span>
                      ) : null}
                      {selected && !cooling ? (
                        <Check className="absolute right-2 top-2 h-4 w-4 text-white" />
                      ) : null}
                    </button>
                  );
                })
              )}

              {otherRefills.length > 0 ? (
                <button
                  type="button"
                  onClick={handleSelectOtherRefills}
                  className={cn(
                    "relative col-span-2 flex min-h-[76px] flex-col items-center justify-center",
                    "rounded-2xl border px-3 py-4 text-center transition-all",
                    "hover:shadow-sm active:scale-[0.99]",
                    activeRefillId === OTHER_REFILLS_ID
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-primary border-primary/30"
                  )}
                >
                  <span className="font-black text-base leading-tight">Other Refills</span>
                  {Object.values(otherQty).some((v) => Number(v || 0) > 0) ? (
                    <Check className="absolute right-2 top-2 h-4 w-4 text-white" />
                  ) : null}
                </button>
              ) : null}

              {mainRefills.length === 0 && otherRefills.length === 0 && !isLoading && (
                <p className="col-span-2 text-center text-sm text-muted-foreground py-10">No refills available for this package.</p>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right: flavors + notes */}
        <div className="md:col-span-2 flex flex-col gap-4">
          <div className="space-y-1">
            <h3 className="font-semibold">2. Customize Selection</h3>
            {defaultFlavorNames ? (
              <p className="text-xs text-muted-foreground">
                Flavors in <span className="text-destructive font-medium">red</span> are from your
                initial order ({defaultFlavorNames}).
              </p>
            ) : null}
          </div>

          {activeRefillId === OTHER_REFILLS_ID ? (
            <div className="flex-1 flex flex-col gap-4">
              <div className="border rounded-lg">
                <div className="p-4 space-y-4">
                  <h3 className="font-semibold">Other Refills</h3>

                  {otherRefills.map((r) => {
                    const v = Number(otherQty[r.refillId] || 0);
                    const remainingMs = remainingFor(r.refillId);
                    if (remainingMs > 0) {
                      return (
                        <div key={r.refillId} className="flex items-center justify-between gap-3 opacity-60">
                          <div>
                            <p className="font-medium">{r.refillName}</p>
                            <p className="text-xs text-muted-foreground">Available again soon</p>
                          </div>
                          <span className="font-mono text-sm tabular-nums text-muted-foreground">
                            {formatCountdown(remainingMs)}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div key={r.refillId} className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{r.refillName}</p>
                          <p className="text-xs text-muted-foreground">Quantity</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() =>
                              setOtherQty((prev) => {
                                const next = { ...prev };
                                next[r.refillId] = Math.max(0, Number(next[r.refillId] || 0) - 1);
                                if (next[r.refillId] === 0) delete next[r.refillId];
                                return next;
                              })
                            }
                          >
                            -
                          </Button>
                          <div className="w-10 text-center font-mono">{v}</div>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() =>
                              setOtherQty((prev) => ({
                                ...prev,
                                [r.refillId]: Number(prev[r.refillId] || 0) + 1,
                              }))
                            }
                          >
                            +
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center text-center text-muted-foreground bg-muted/50 rounded-lg">
                <p>Optional add-ons. Each one can be re-ordered every 10 minutes.</p>
              </div>
            </div>
          ) : activeCartItem ? (
            <div className="flex-1 flex flex-col gap-4">
              <div className={cn("border rounded-lg", !needsFlavors && "bg-muted/50")}>
                <div className="p-4 space-y-2">
                  <h3 className="font-semibold">
                    {needsFlavors ? "Flavor — choose 1 per meat" : "Flavors"}
                  </h3>

                  {needsFlavors ? (
                    <RadioGroup
                      value={activeCartItem.flavorIds[0] ?? ""}
                      onValueChange={handleFlavorSelect}
                      className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto"
                    >
                      {sortedAllowedFlavors.map((flavor) => (
                        <div key={flavor.flavorId} className="flex items-center gap-2">
                          <RadioGroupItem
                            id={`flavor-${flavor.flavorId}`}
                            value={flavor.flavorId}
                          />
                          <Label
                            htmlFor={`flavor-${flavor.flavorId}`}
                            className={cn(
                              "font-normal",
                              initialFlavorIdSet.has(flavor.flavorId) && "text-destructive font-medium"
                            )}
                          >
                            {flavor.flavorName}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  ) : (
                    <p className="text-sm text-muted-foreground">This item does not require flavors.</p>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={activeCartItem.notes}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  placeholder="e.g., extra hot, no onions..."
                  className="flex-1"
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center text-muted-foreground bg-muted/50 rounded-lg">
              <p>Select a refill item on the left to customize it.</p>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border-t flex justify-end gap-2">
        <Button variant="ghost" onClick={closeAndReset}>Cancel</Button>
        <Button onClick={submitCart} disabled={isSubmitting || !!sessionIsLocked || (cart.size === 0 && !Object.values(otherQty).some((v) => Number(v || 0) > 0))}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : `Send`}
        </Button>
      </div>
    </div>
  );
}