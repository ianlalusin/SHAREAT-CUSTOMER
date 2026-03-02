"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";

import { getAuth } from "firebase/auth";
import { useFirebase } from "@/firebase";

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
}) {
  const isMobile = useIsMobile();
  const handleOpenChange = (open: boolean) => {
    if (!open) props.onOpenChange(false);
  };

  const content = (
    <CustomerRefillContent
      session={props.session}
      sessionIsLocked={props.sessionIsLocked}
      onClose={() => props.onOpenChange(false)}
    />
  );

  if (isMobile) {
    return (
      <Drawer open={props.open} onOpenChange={handleOpenChange}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Order Refill</DrawerTitle>
            <DrawerDescription>Select refill items and flavors.</DrawerDescription>
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
          <DialogDescription>Select refill items and flavors.</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

function CustomerRefillContent({
  session,
  sessionIsLocked,
  onClose,
}: {
  session: CustomerSession;
  sessionIsLocked?: boolean;
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
  const [otherQty, setOtherQty] = useState<Record<string, number>>({});

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

  const otherRefills = useMemo(() => filteredRefills.filter(r => !!r.isOther), [filteredRefills]);
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

  const handleFlavorToggle = (flavorId: string) => {
    if (!activeRefillId) return;
    setCart((prev) => {
      const next = new Map(prev);
      const item = next.get(activeRefillId);
      if (!item) return prev;

      const isSelected = item.flavorIds.includes(flavorId);
      let newFlavorIds = item.flavorIds;

      if (isSelected) {
        newFlavorIds = item.flavorIds.filter((id) => id !== flavorId);
      } else {
        if (item.flavorIds.length >= 3) {
          toast({ variant: "destructive", title: "Flavor Limit", description: "Maximum of 3 flavors." });
          return prev;
        }
        newFlavorIds = [...item.flavorIds, flavorId];
      }

      next.set(activeRefillId, { ...item, flavorIds: newFlavorIds });
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
      toast({ variant: "destructive", title: "Empty", description: "Select at least one refill." });
      return;
    }

    // validate each cart item
    for (const item of cart.values()) {
      const globalInfo = globalRefills.find((r) => r.id === item.refill.refillId);
      if (globalInfo?.requiresFlavor && sortedAllowedFlavors.length > 0 && item.flavorIds.length === 0) {
        toast({
          variant: "destructive",
          title: "Flavor Required",
          description: `"${item.refill.refillName}" needs at least one flavor.`,
        });
        setActiveRefillId(item.refill.refillId);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Session expired. Please re-enter your PIN.");

      const idToken = await user.getIdToken();

      const items = Array.from(cart.values()).map((item) => {
        const flavorNames = item.flavorIds
          .map((id) => storeFlavors.find((f) => f.flavorId === id)?.flavorName)
          .filter(Boolean) as string[];

        const flavorNote = flavorNames.length ? `Flavors: ${flavorNames.join(", ")}` : "";
        const notes = [item.notes.trim(), flavorNote].filter(Boolean).join(" | ");

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
        };
      });

      const otherStation = otherRefills.find((r) => !!r.kitchenLocationId) || otherRefills[0];

      if (hasOther) {
        items.push({
          itemId: "OTHER_REFILLS",
          itemName: "OTHER REFILLS",
          refillId: "OTHER_REFILLS",
          refillName: "OTHER REFILLS",
          kitchenLocationId: otherStation?.kitchenLocationId || "",
          kitchenLocationName: otherStation?.kitchenLocationName || "Kitchen",
          qty: 1,
          notes: "",
          refillRequest: Object.fromEntries(
            Object.entries(otherQty)
              .map(([k, v]) => [k, Number(v || 0)])
              .filter(([, v]) => Number(v) > 0)
          ),
        } as any);
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
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to submit refill.");

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
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 overflow-y-auto">
        {/* Left: refills list */}
        <div className="md:col-span-1 border-r pr-4 flex flex-col">
          <h3 className="font-semibold mb-2">1. Select Refills</h3>
          <ScrollArea className="flex-1">
            <div className="space-y-1">
              {isLoading ? (
                <Loader2 className="mx-auto my-16 animate-spin" />
              ) : (
                mainRefills.map((refill) => {
                  const selected = cart.has(refill.refillId);
                  return (
                    <button
                      key={refill.refillId}
                      onClick={() => handleSelectRefill(refill)}
                      className={cn(
                        "w-full text-left rounded-2xl px-4 py-3 border transition-all",
                        "hover:shadow-sm active:scale-[0.99]",
                        selected
                          ? "bg-primary text-white border-primary"
                          : "bg-white text-primary border-primary/30"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-black text-lg">{refill.refillName}</div>
                        {selected ? <Check className="h-5 w-5 text-white" /> : null}
                      </div>
                    </button>
                  );
                })
              )}

              {otherRefills.length > 0 ? (
                <button
                  type="button"
                  onClick={handleSelectOtherRefills}
                  className={cn(
                    "w-full text-left rounded-2xl px-4 py-3 border transition-all",
                    "hover:shadow-sm active:scale-[0.99]",
                    activeRefillId === OTHER_REFILLS_ID
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-primary border-primary/30"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-black text-lg">Other Refills</div>
                    {Object.values(otherQty).some((v) => Number(v || 0) > 0) ? <Check className="h-5 w-5 text-white" /> : null}
                  </div>
                </button>
              ) : null}

              {mainRefills.length === 0 && otherRefills.length === 0 && !isLoading && (
                <p className="text-center text-sm text-muted-foreground py-10">No refills available for this package.</p>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right: flavors + notes */}
        <div className="md:col-span-2 flex flex-col gap-4">
          <h3 className="font-semibold">2. Customize Selection</h3>

          {activeRefillId === OTHER_REFILLS_ID ? (
            <div className="flex-1 flex flex-col gap-4">
              <div className="border rounded-lg">
                <div className="p-4 space-y-4">
                  <h3 className="font-semibold">Other Refills</h3>

                  {otherRefills.map((r) => {
                    const v = Number(otherQty[r.refillId] || 0);
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
                <p>These refills are always available and optional.</p>
              </div>
            </div>
          ) : activeCartItem ? (
            <div className="flex-1 flex flex-col gap-4">
              <div className={cn("border rounded-lg", !needsFlavors && "bg-muted/50")}>
                <div className="p-4 space-y-2">
                  <h3 className="font-semibold">Flavors {needsFlavors ? "(up to 3)" : ""}</h3>

                  {needsFlavors ? (
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                      {sortedAllowedFlavors.map((flavor) => (
                        <div key={flavor.flavorId} className="flex items-center gap-2">
                          <Checkbox
                            id={`flavor-${flavor.flavorId}`}
                            checked={activeCartItem.flavorIds.includes(flavor.flavorId)}
                            onCheckedChange={() => handleFlavorToggle(flavor.flavorId)}
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
                    </div>
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
          {isSubmitting ? <Loader2 className="animate-spin" /> : `Send ${cart.size} Item(s)`}
        </Button>
      </div>
    </div>
  );
}