"use client";

import { Badge } from "@/components/ui/badge";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

interface HeaderProps {
  customerName: string;
  tableDisplayName: string;
  packageName: string;
}

export function DashboardHeader({ customerName, tableDisplayName, packageName }: HeaderProps) {
  const router = useRouter();

  const handleLogout = () => {
    document.cookie = "customer_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    document.cookie = "session_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    document.cookie = "store_id=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    document.cookie = "session_id=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    document.cookie = "session_table=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    router.push("/");
  };

  return (
    <header className="bg-primary text-white sticky top-0 z-50 shadow-lg">
      <div className="container max-w-7xl mx-auto px-4 sm:px-8 py-4 relative">
        <button
          onClick={handleLogout}
          className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/15 active:scale-95 transition border border-white/10"
          title="End Session"
          aria-label="End Session"
        >
          <LogOut className="h-6 w-6" />
        </button>

        <div className="text-center px-12 sm:px-16">
          <div className="text-sm sm:text-base font-bold text-white/85">
            Hello {customerName || "Customer"}
          </div>

          <div className="mt-2 flex items-center justify-center gap-2 flex-wrap">
            <Badge className="rounded-xl bg-white/15 text-white border border-white/10">
              {tableDisplayName || "Table -"}
            </Badge>
            <span className="text-white/70 font-black">|</span>
            <Badge className="rounded-xl bg-white text-primary border-none font-black">
              {packageName || "Package -"}
            </Badge>
          </div>

          <div className="mt-2 text-[10px] sm:text-xs text-white/80 font-bold">
            If the details are wrong, please approach our staff.
          </div>
        </div>
      </div>
    </header>
  );
}
