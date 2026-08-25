"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useStaffSession } from "@/components/admin/useStaffSession";

/**
 * The gate on the whole `/admin` tree.
 *
 * Before this, `/admin` checked only that SOMEONE was signed in — a diner who
 * had ever authenticated could open the hub, and every tile rendered for them.
 * The API routes refused their data, but the surface was reachable.
 *
 * `/admin` is now platform-admin only. A manager is not refused, they are sent
 * to `/manager`, which is their tree and holds the branch-scoped versions of
 * these same screens.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { loading, isStaff, isPlatformAdmin } = useStaffSession();

  // The login page lives under /admin, so it has to be let through or there is
  // no way to sign in and satisfy the gate.
  const isLogin = pathname === "/admin/login";

  useEffect(() => {
    if (isLogin || loading) return;
    if (!isStaff) router.replace("/admin/login");
  }, [isLogin, loading, isStaff, router]);

  if (isLogin) return <>{children}</>;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isStaff) return null;

  if (!isPlatformAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-[2rem] bg-white p-8 text-center shadow-xl">
          <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-4 text-xl font-black">This area is for platform admins</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your branch tools are on the manager screen.
          </p>
          <Button className="mt-5 h-12 w-full rounded-2xl font-bold" onClick={() => router.replace("/manager")}>
            Go to Manager
          </Button>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
