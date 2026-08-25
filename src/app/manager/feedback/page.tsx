"use client";

import { MessageSquare } from "lucide-react";

import { ManagerHeader } from "@/components/admin/ManagerHeader";
import { useStoreScope } from "@/components/admin/StoreScope";
import { FeedbackPanel } from "@/components/admin/FeedbackPanel";

export default function ManagerFeedbackPage() {
  const { storeId, storeName } = useStoreScope();

  return (
    <main className="mx-auto min-h-screen max-w-[980px] space-y-6 p-6">
      <ManagerHeader
        title="Feedback"
        subtitle="What diners at this branch said."
        icon={<MessageSquare className="h-6 w-6" />}
      />
      <FeedbackPanel storeId={storeId} storeName={storeName} />
    </main>
  );
}
