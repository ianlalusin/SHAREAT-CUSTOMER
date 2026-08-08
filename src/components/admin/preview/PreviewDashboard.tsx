"use client";

import { useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import { Loader2, Plus, Bell, Star, Flame, Eye } from "lucide-react";

import { DashboardHeader } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { CustomerCatalog } from "@/components/customer/CustomerCatalog";
import { PreviewLoyaltyCard } from "@/components/admin/preview/PreviewLoyaltyCard";
import { useToast } from "@/hooks/use-toast";
import { getMockSession, getMockLoyaltyData } from "@/lib/preview/mock-data";

interface Props {
  storeId: string;
  storeName: string;
}

type CatalogItem = { id: string; name: string; category: string; price: number; imageUrl?: string | null };

/**
 * The admin/manager "Preview" screen: a visual twin of the real customer
 * dashboard (src/app/dashboard/page.tsx), fed by this store's real catalog
 * (read-only) and a mock session/loyalty identity. No code path here ever
 * calls a real customer-write API (refill, griller, assistance, feedback,
 * redeem, transfer) — every action button reports to `notifyPreview` instead,
 * which just shows a toast. That's a deliberate architecture choice, not a
 * runtime flag: there's nothing to accidentally leave un-guarded.
 */
export function PreviewDashboard({ storeId, storeName }: Props) {
  const { toast } = useToast();
  const session = useMemo(() => getMockSession(storeId, storeName), [storeId, storeName]);
  const loyalty = useMemo(() => getMockLoyaltyData(storeId), [storeId]);

  const [isCardOpen, setIsCardOpen] = useState(false);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoadingItems(true);
      setItemsError(null);
      try {
        const user = getAuth().currentUser;
        if (!user) throw new Error("Not signed in.");
        const idToken = await user.getIdToken();
        const res = await fetch(`/api/admin/preview-catalog?storeId=${encodeURIComponent(storeId)}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load catalog.");
        if (cancelled) return;
        setItems(Array.isArray(json.items) ? json.items : []);
      } catch (e: any) {
        if (cancelled) return;
        setItemsError(e?.message || "Unable to load menu.");
        setItems([]);
      } finally {
        if (!cancelled) setIsLoadingItems(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [storeId]);

  function notifyPreview(action: string) {
    toast({
      title: "Preview mode",
      description: `"${action}" isn't sent anywhere here — this is just showing you where it lives in the real app.`,
    });
  }

  return (
    <main className="min-h-screen pb-16 flex flex-col bg-zinc-50 rounded-2xl overflow-hidden border">
      <div className="bg-amber-400 text-amber-950 text-xs font-bold text-center py-1.5 flex items-center justify-center gap-1.5">
        <Eye className="h-3.5 w-3.5" />
        Preview mode — read only, no real orders or requests are sent
      </div>

      <DashboardHeader
        customerName={session.customerName}
        tableDisplayName={session.tableDisplayName}
        packageName={session.packageName}
        onLogout={() => notifyPreview("End Session")}
        logoutLabel="Exit (preview)"
      />

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 mt-6 relative z-10">
        <div className="w-full sm:w-[420px] mx-auto grid grid-cols-2 gap-3">
          <Button
            className="h-14 rounded-2xl text-base font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
            onClick={() => notifyPreview("Order Refill")}
          >
            <Plus className="mr-2 h-5 w-5" />
            Order Refill
          </Button>
          <Button
            variant="outline"
            className="h-14 rounded-2xl text-base font-bold border-2 border-primary/30 text-primary hover:bg-primary/5 active:scale-[0.98] transition-all"
            onClick={() => notifyPreview("Add Griller")}
          >
            <Flame className="mr-2 h-5 w-5" />
            Add Griller
          </Button>
          <Button
            variant="outline"
            className="h-14 rounded-2xl text-base font-bold border-2 border-primary/30 text-primary hover:bg-primary/5 active:scale-[0.98] transition-all"
            onClick={() => notifyPreview("Ask for assistance")}
          >
            <Bell className="mr-2 h-5 w-5" />
            Ask for assistance
          </Button>
          <button
            type="button"
            onClick={() => setIsCardOpen(true)}
            className="relative h-14 rounded-2xl overflow-hidden border border-zinc-700 bg-black shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
            aria-label="Open Loyalty Card"
          >
            <span className="relative flex items-center justify-center gap-2 text-base font-bold text-white">
              <Star className="h-5 w-5 drop-shadow" strokeWidth={2.5} fill="currentColor" />
              Loyalty Card
            </span>
          </button>
        </div>

        {isLoadingItems ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : itemsError ? (
          <div className="py-10 text-center text-sm text-destructive">{itemsError}</div>
        ) : (
          <CustomerCatalog overrideItems={items} />
        )}
      </div>

      <Drawer open={isCardOpen} onOpenChange={setIsCardOpen}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>Sharelebrator Card</DrawerTitle>
            <DrawerDescription>Mock points, history, and rewards — for preview only.</DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
            <PreviewLoyaltyCard customer={loyalty.customer} ledger={loyalty.ledger} onPreviewAction={notifyPreview} />
          </div>
        </DrawerContent>
      </Drawer>
    </main>
  );
}
