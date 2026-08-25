"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Megaphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStaffSession } from "@/components/admin/useStaffSession";
import { FlashAdsPanel } from "@/components/admin/FlashAdsPanel";

/**
 * Flash ads, chain-wide: an admin picks any branch.
 *
 * The screen itself is `FlashAdsPanel`, shared with `/manager/ads`. Only the
 * shell differs — which stores the picker offers, and who is allowed here at
 * all. Two copies of this screen would drift; one copy cannot.
 */
export default function AdminFlashAdsPage() {
  const router = useRouter();
  const { loading, stores, storeId, setStoreId } = useStaffSession();

  const storeName = stores.find((s) => s.storeId === storeId)?.name || storeId;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-[800px] space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => router.push("/admin")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black">
            <Megaphone className="h-6 w-6" /> Flash Ads
          </h1>
          <p className="text-sm font-medium text-zinc-500">Promotional ads shown to diners.</p>
        </div>
      </div>

      {stores.length > 1 ? (
        <Select value={storeId} onValueChange={setStoreId}>
          <SelectTrigger className="h-12 w-full rounded-2xl">
            <SelectValue placeholder="Select store" />
          </SelectTrigger>
          <SelectContent>
            {stores.map((s) => (
              <SelectItem key={s.storeId} value={s.storeId}>
                {s.name || s.storeId}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : stores.length === 1 ? (
        <p className="text-sm text-zinc-500">
          Store: <b>{storeName}</b>
        </p>
      ) : (
        <p className="text-sm text-zinc-400">No stores assigned.</p>
      )}

      {storeId && <FlashAdsPanel key={storeId} storeId={storeId} />}
    </main>
  );
}
