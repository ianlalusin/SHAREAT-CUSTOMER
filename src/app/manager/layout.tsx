"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useStaffSession } from "@/components/admin/useStaffSession";
import { StoreScopeProvider } from "@/components/admin/StoreScope";

/**
 * The manager shell.
 *
 * A separate tree from `/admin` on purpose: a manager works one branch, and the
 * safest way to keep them out of a chain-wide lever is for that lever not to
 * exist on their screens at all. Gating each admin page for two audiences puts
 * the burden on remembering; this puts it on the routing.
 *
 * The gate here is a courtesy — it decides what to render. Every route the
 * screens call re-checks the caller and the storeId, and the live Firestore
 * rules refuse a branch this staff member is not assigned to. Nothing below is
 * load-bearing for security.
 */
export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { loading, isStaff, role, isPlatformAdmin, stores, storeId, setStoreId, error } = useStaffSession();

  useEffect(() => {
    if (loading) return;
    if (!isStaff) router.replace("/admin/login");
  }, [loading, isStaff, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!isStaff) return null;

  // Cashiers and kitchen staff have no business here. An unlisted role is a
  // denial, which is the safe direction to be wrong in.
  const mayManage = isPlatformAdmin || role === "manager";
  if (!mayManage) {
    return (
      <Refusal
        title="This area is for branch managers"
        body="Your account is signed in, but it does not have manager access."
      />
    );
  }

  // A manager with no branch assigned can do nothing here, and saying so plainly
  // beats an empty screen that looks broken.
  if (stores.length === 0) {
    return (
      <Refusal
        title="No branch assigned to you"
        body={error || "Ask an admin to assign your account to a store, then sign in again."}
      />
    );
  }

  const storeName = stores.find((s) => s.storeId === storeId)?.name || storeId;

  return (
    <StoreScopeProvider value={{ storeId, storeName, stores, setStoreId, role, isPlatformAdmin }}>
      {children}
    </StoreScopeProvider>
  );
}

function Refusal({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-sm rounded-[2rem] bg-white p-8 text-center shadow-xl">
        <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-4 text-xl font-black">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        <Button
          variant="outline"
          className="mt-5 h-12 w-full rounded-2xl font-bold"
          onClick={() => (window.location.href = "/admin/login")}
        >
          Sign in as someone else
        </Button>
      </div>
    </main>
  );
}
