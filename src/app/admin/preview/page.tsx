"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStaffSession } from "@/components/admin/useStaffSession";
import { PreviewDashboard } from "@/components/admin/preview/PreviewDashboard";

/** The diner view of any branch. Shared with `/manager/preview`. */
export default function AdminPreviewPage() {
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
    <main className="mx-auto min-h-screen max-w-[520px] space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => router.push("/admin")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black">
            <Eye className="h-6 w-6" /> Preview
          </h1>
          <p className="text-sm font-medium text-zinc-500">Exactly what a diner sees. Read only.</p>
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
      ) : stores.length === 0 ? (
        <p className="text-sm text-zinc-400">No stores assigned.</p>
      ) : null}

      {storeId && <PreviewDashboard storeId={storeId} storeName={storeName} />}
    </main>
  );
}
