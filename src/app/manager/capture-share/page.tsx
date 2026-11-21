"use client";

import { Camera } from "lucide-react";

import { ManagerHeader } from "@/components/admin/ManagerHeader";
import { useStoreScope } from "@/components/admin/StoreScope";
import { CaptureSharePanel } from "@/components/admin/CaptureSharePanel";

export default function ManagerCaptureSharePage() {
  const { storeId, storeName } = useStoreScope();

  return (
    <main className="mx-auto min-h-screen max-w-[980px] space-y-6 p-6">
      <ManagerHeader title="Guest photos" subtitle="Capture & Share photos guests OK'd for social posts." icon={<Camera className="h-6 w-6" />} />
      <CaptureSharePanel storeId={storeId} storeName={storeName} />
    </main>
  );
}
