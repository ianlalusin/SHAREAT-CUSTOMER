"use client";

import { useRouter } from "next/navigation";
import { getAuth, signOut } from "firebase/auth";
import { ArrowLeft, Loader2, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStaffSession } from "@/components/admin/useStaffSession";
import { FeedbackPanel } from "@/components/admin/FeedbackPanel";

/**
 * Diner feedback, chain-wide: an admin picks any branch.
 *
 * The screen itself is `FeedbackPanel`, shared with `/manager/feedback`.
 */
export default function AdminFeedbackPage() {
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
    <main className="mx-auto min-h-screen max-w-[980px] space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => router.push("/admin")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-black">
            <MessageSquare className="h-6 w-6" /> Feedback
          </h1>
        </div>

        <Button
          variant="outline"
          className="h-11 rounded-xl"
          onClick={async () => {
            try {
              await signOut(getAuth());
            } catch {
              /* signing out is best-effort; the redirect is what matters */
            }
            router.push("/");
          }}
        >
          Exit Admin
        </Button>
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

      {storeId && <FeedbackPanel storeId={storeId} storeName={storeName} />}
    </main>
  );
}
