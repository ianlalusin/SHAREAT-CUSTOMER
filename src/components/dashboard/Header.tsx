"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

interface HeaderProps {
  customerName: string;
  tableName: string;
}

export function DashboardHeader({ customerName, tableName }: HeaderProps) {
  const router = useRouter();

  const handleLogout = () => {
    document.cookie = "customer_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    document.cookie = "session_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    router.push("/");
  };

  return (
    <header className="bg-primary pt-12 pb-28 text-white rounded-b-[4rem] lg:rounded-b-[5rem] shadow-2xl sticky top-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
      <div className="container max-w-7xl mx-auto px-6 sm:px-8 relative z-10">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4 sm:gap-8">
            <Avatar className="h-20 w-20 sm:h-24 sm:w-24 border-4 border-white/20 shadow-2xl ring-8 ring-white/5">
              <AvatarFallback className="bg-white/10 text-white">
                <User className="h-10 w-10 sm:h-12 sm:w-12" />
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-white/70 text-base sm:text-lg font-medium">Dining at</p>
              <h2 className="text-3xl sm:text-5xl font-black leading-tight tracking-tight">{customerName || "Table Guest"}</h2>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="p-4 sm:p-5 hover:bg-white/10 rounded-full transition-all active:scale-90 bg-white/5 backdrop-blur-md border border-white/10 shadow-xl group"
            title="End Session"
          >
            <LogOut className="h-8 w-8 sm:h-10 sm:w-10 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
        
        <div className="flex items-center gap-4">
          <Badge variant="secondary" className="bg-accent text-accent-foreground px-6 py-2.5 text-base sm:text-xl font-black rounded-2xl border-none shadow-xl">
            TABLE {tableName}
          </Badge>
          <Badge variant="outline" className="border-white/30 text-white/90 px-6 py-2.5 text-xs sm:text-sm font-black rounded-2xl backdrop-blur-md tracking-widest uppercase">
            SESSION ACTIVE
          </Badge>
        </div>
      </div>
    </header>
  );
}
