"use client";

import { KeyRound } from "lucide-react";

import { ManagerHeader } from "@/components/admin/ManagerHeader";
import { useStoreScope } from "@/components/admin/StoreScope";
import { PinsPanel } from "@/components/admin/PinsPanel";

export default function ManagerPinsPage() {
  const { storeId, storeName } = useStoreScope();

  return (
    <main className="mx-auto min-h-screen max-w-[720px] space-y-6 p-6">
      <ManagerHeader
        title="Table PINs"
        subtitle="Only this branch. A seated table cannot be deleted."
        icon={<KeyRound className="h-6 w-6" />}
      />
      {storeId && <PinsPanel key={storeId} storeId={storeId} storeName={storeName} />}
    </main>
  );
}
