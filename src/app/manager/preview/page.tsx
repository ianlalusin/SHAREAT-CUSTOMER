"use client";

import { Eye } from "lucide-react";

import { ManagerHeader } from "@/components/admin/ManagerHeader";
import { useStoreScope } from "@/components/admin/StoreScope";
import { PreviewDashboard } from "@/components/admin/preview/PreviewDashboard";

export default function ManagerPreviewPage() {
  const { storeId, storeName } = useStoreScope();

  return (
    <main className="mx-auto min-h-screen max-w-[520px] space-y-6 p-6">
      <ManagerHeader
        title="Preview"
        subtitle="Exactly what a diner at this branch sees. Read only."
        icon={<Eye className="h-6 w-6" />}
      />
      {storeId && <PreviewDashboard storeId={storeId} storeName={storeName} />}
    </main>
  );
}
