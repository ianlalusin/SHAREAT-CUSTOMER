"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStaffSession } from "@/components/admin/useStaffSession";
import { PinsPanel } from "@/components/admin/PinsPanel";

/**
 * Table PINs, chain-wide: an admin picks a branch.
 *
 * Replaces the PIN table that used to sit on the admin hub. That one listed the
 * newest 200 across every branch with a client-side query and a per-row
 * deleteDoc — both refused by the live rules, so the delete button never worked
 * and the list only ever rendered for an admin.
 */
export default function AdminPinsPage() {
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
    <main className="mx-auto min-h-screen max-w-[720px] space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => router.push("/admin")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black">
            <KeyRound className="h-6 w-6" /> Table PINs
          </h1>
          <p className="text-sm font-medium text-zinc-500">A seated table cannot be deleted.</p>
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

      {storeId && <PinsPanel key={storeId} storeId={storeId} storeName={storeName} />}
    </main>
  );
}
