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
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";

import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { useFirebase } from "@/firebase";

type StoreRefill = {
  id?: string;
  refillId: string;
  refillName: string;
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
  const { firestore } = useFirebase();

  const [storeRefills, setStoreRefills] = useState<StoreRefill[]>([]);
  const [globalRefills, setGlobalRefills] = useState<Refill[]>([]);
  const [storeFlavors, setStoreFlavors] = useState<StoreFlavor[]>([]);
  const [currentPackage, setCurrentPackage] = useState<StorePackage | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [cart, setCart] = useState<Map<string, CartItem>>(new Map());
  const [activeRefillId, setActiveRefillId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!session?.storeId) {
      setIsLoading(false);
      return;
    }

    const unsubs: (() => void)[] = [];

    const storeRefillsQuery = query(
      collection(firestore, "stores", session.storeId, "storeRefills"),
      where("isEnabled", "==", true),
      orderBy("sortOrder", "asc")
    );
    unsubs.push(
      onSnapshot(storeRefillsQuery, (snap) => {
        setStoreRefills(
          snap.docs.map((d) => {
            const data = d.data() as any;
            return { ...data, id: d.id, refillId: d.id };
          })
        );
      })
    );

    const globalRefillsQuery = query(collection(firestore, "refills"), where("isActive", "==", true));
    unsubs.push(
      onSnapshot(globalRefillsQuery, (snap) => {
        setGlobalRefills(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      })
    );

    const flavorsQuery = query(
      collection(firestore, "stores", session.storeId, "storeFlavors"),
      where("isEnabled", "==", true)
    );
    unsubs.push(
      onSnapshot(flavorsQuery, (snap) => {
        setStoreFlavors(
          snap.docs.map((d) => {
            const data = d.data() as any;
            return { ...data, id: d.id, flavorId: d.id };
          })
        );
      })
    );

    if (session.packageOfferingId) {
      const pkgRef = doc(firestore, "stores", session.storeId, "storePackages", session.packageOfferingId);
      unsubs.push(
        onSnapshot(pkgRef, (docSnap) => {
          if (docSnap.exists()) setCurrentPackage(docSnap.data() as any);
        })
      );
    }

    Promise.all([getDocs(storeRefillsQuery), getDocs(flavorsQuery)]).finally(() => setIsLoading(false));
    return () => unsubs.forEach((u) => u());
  }, [firestore, session.storeId, session.packageOfferingId]);

  const filteredRefills = useMemo(() => {
    let available = storeRefills;
    if (currentPackage?.refillsAllowed?.length) {
      const allowed = new Set(currentPackage.refillsAllowed);
      available = available.filter((r) => allowed.has(r.refillId));
    }
    return available;
  }, [storeRefills, currentPackage]);

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
    setCart((prev) => {
      const next = new Map(prev);
      if (!next.has(refill.refillId)) {
        next.set(refill.refillId, { refill, flavorIds: [], notes: "" });
      }
      return next;
    });
    setActiveRefillId(refill.refillId);
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
    if (cart.size === 0) {
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
      const payloadItems = Array.from(cart.values()).map((item) => {
        const flavorNames = item.flavorIds
          .map((id) => storeFlavors.find((f) => f.flavorId === id)?.flavorName || id)
          .filter(Boolean);

        return {
          refillId: item.refill.refillId,
          refillName: item.refill.refillName,
          flavorIds: item.flavorIds,
          flavorNames,
          notes: item.notes.trim() || null,
        };
      });

      await addDoc(collection(firestore, "refillRequests"), {
        storeId: session.storeId,
        sessionId: session.id,
        tableId: session.tableId,
        tableDisplayName: session.tableDisplayName || null,
        status: "preparing", // customer hub lifecycle
        requestedBy: "customer",
        createdAt: serverTimestamp(),
        servedAt: null,
        packageOfferingId: session.packageOfferingId,
        packageName: currentPackage?.packageName || currentPackage?.name || session.packageSnapshot?.name || null,
        items: payloadItems,
      });

      toast({ title: `Sent ${cart.size} refill(s).`, description: "Status: Preparing" });
      setCart(new Map());
      setActiveRefillId(null);
      onClose();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed", description: e?.message ?? "Unknown error" });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function repeatFirstOrder() {
    if (sessionIsLocked) {
      toast({ variant: "destructive", title: "Session Locked", description: "Refills are disabled." });
      return;
    }
    if (!currentPackage) {
      toast({ variant: "destructive", title: "No Package", description: "Package info not found." });
      return;
    }

    setIsSubmitting(true);
    try {
      const allowed = new Set(currentPackage.refillsAllowed || []);
      const refillsToOrder = storeRefills.filter((sr) => sr.isEnabled && allowed.has(sr.refillId));

      if (refillsToOrder.length === 0) {
        toast({ variant: "destructive", title: "No Refills", description: "No refills enabled for this package." });
        return;
      }

      const flavorIds = session.initialFlavorIds || [];
      const flavorNames = flavorIds
        .map((id) => storeFlavors.find((f) => f.flavorId === id)?.flavorName || id)
        .filter(Boolean);

      await addDoc(collection(firestore, "refillRequests"), {
        storeId: session.storeId,
        sessionId: session.id,
        tableId: session.tableId,
        tableDisplayName: session.tableDisplayName || null,
        status: "preparing",
        requestedBy: "customer",
        createdAt: serverTimestamp(),
        servedAt: null,
        packageOfferingId: session.packageOfferingId,
        packageName: currentPackage?.packageName || currentPackage?.name || session.packageSnapshot?.name || null,
        items: [
          {
            refillId: "REFILL_PACKAGE_FIRST_ORDER",
            refillName: `REFILL - ${(currentPackage as any)?.packageName || (currentPackage as any)?.name || "Package"}`,
            flavorIds,
            flavorNames,
            notes: flavorNames.length ? `Flavors: ${flavorNames.join(", ")}` : null,
          },
        ],
      });

      toast({ title: "Sent first order refill.", description: defaultFlavorNames ? `Flavors: ${defaultFlavorNames}` : undefined });
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
    onClose();
  }

  return (
    <div className="h-[70vh] flex flex-col">
      <div className="p-4 border-b">
        <div className="flex items-start sm:items-center gap-4 flex-col sm:flex-row">
          <Button
            variant="destructive"
            onClick={repeatFirstOrder}
            disabled={isSubmitting || !!sessionIsLocked}
            className="flex-shrink-0"
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Repeat First Order
          </Button>
          <div className="text-xs text-muted-foreground">
            <p>Sends all refills allowed by the package with the default flavors.</p>
            {defaultFlavorNames ? (
              <p>
                <span className="font-semibold">Default Flavors:</span>{" "}
                <span className="text-destructive font-medium">{defaultFlavorNames}</span>
              </p>
            ) : null}
          </div>
        </div>
        <Separator className="mt-2 mb-0" />
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 overflow-y-auto">
        {/* Left: refills list */}
        <div className="md:col-span-1 border-r pr-4 flex flex-col">
          <h3 className="font-semibold mb-2">1. Select Refills</h3>
          <ScrollArea className="flex-1">
            <div className="space-y-1">
              {isLoading ? (
                <Loader2 className="mx-auto my-16 animate-spin" />
              ) : (
                filteredRefills.map((refill) => (
                  <button
                    key={refill.refillId}
                    onClick={() => handleSelectRefill(refill)}
                    className={cn(
                      "w-full text-left p-2 border rounded-md hover:bg-muted/50 transition-colors",
                      cart.has(refill.refillId) && "bg-muted font-semibold",
                      activeRefillId === refill.refillId &&
                        "bg-destructive/10 text-destructive border-destructive font-bold"
                    )}
                  >
                    {refill.refillName}
                  </button>
                ))
              )}
              {filteredRefills.length === 0 && !isLoading && (
                <p className="text-center text-sm text-muted-foreground py-10">No refills available for this package.</p>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right: flavors + notes */}
        <div className="md:col-span-2 flex flex-col gap-4">
          <h3 className="font-semibold">2. Customize Selection</h3>

          {activeCartItem ? (
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
        <Button onClick={submitCart} disabled={isSubmitting || !!sessionIsLocked || cart.size === 0}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : `Send ${cart.size} Item(s)`}
        </Button>
      </div>
    </div>
  );
}