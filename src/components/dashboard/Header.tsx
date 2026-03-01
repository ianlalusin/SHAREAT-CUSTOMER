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
    document.cookie = "session_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    router.push("/");
  };

  return (
    <header className="bg-primary pt-12 pb-24 text-white rounded-b-[3rem] lg:rounded-b-[4rem] shadow-xl sticky top-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
      <div className="container max-w-7xl mx-auto px-6 relative z-10">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4 sm:gap-6">
            <Avatar className="h-16 w-16 sm:h-20 sm:w-20 border-4 border-white/20 shadow-inner">
              <AvatarFallback className="bg-white/10 text-white">
                <User className="h-8 w-8 sm:h-10 sm:w-10" />
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-white/70 text-sm sm:text-base font-medium">Welcome back,</p>
              <h2 className="text-2xl sm:text-4xl font-black leading-tight tracking-tight">{customerName}</h2>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="p-3 sm:p-4 hover:bg-white/10 rounded-full transition-all active:scale-95 bg-white/5 backdrop-blur-sm border border-white/10"
            title="End Session"
          >
            <LogOut className="h-7 w-7 sm:h-8 sm:w-8" />
          </button>
        </div>
        
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="bg-accent text-accent-foreground px-5 py-2 text-sm sm:text-lg font-black rounded-2xl border-none shadow-sm">
            TABLE {tableName}
          </Badge>
          <Badge variant="outline" className="border-white/30 text-white/90 px-5 py-2 text-xs sm:text-sm font-bold rounded-2xl backdrop-blur-sm">
            SESSION ACTIVE
          </Badge>
        </div>
      </div>
    </header>
  );
}
