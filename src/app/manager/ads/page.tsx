"use client";

import { Megaphone } from "lucide-react";

import { ManagerHeader } from "@/components/admin/ManagerHeader";
import { useStoreScope } from "@/components/admin/StoreScope";
import { FlashAdsPanel } from "@/components/admin/FlashAdsPanel";

export default function ManagerAdsPage() {
  const { storeId } = useStoreScope();

  return (
    <main className="mx-auto min-h-screen max-w-[800px] space-y-6 p-6">
      <ManagerHeader
        title="Flash Ads"
        subtitle="What pops up on the diner hub at this branch."
        icon={<Megaphone className="h-6 w-6" />}
      />
      {/* Remount on a branch switch: a half-edited form must never be saved
          against the store the manager just switched away from. */}
      {storeId && <FlashAdsPanel key={storeId} storeId={storeId} />}
    </main>
  );
}
