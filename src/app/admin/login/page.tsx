"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();

  useEffect(() => {
    // Authentication removed. Redirecting to admin directly for development.
    router.replace("/admin/items");
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-zinc-50">
      <div className="flex flex-col items-center gap-4 bg-white p-12 rounded-[2rem] shadow-xl">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-zinc-500 font-bold text-lg">Initializing Admin Portal...</p>
      </div>
    </main>
  );
}
