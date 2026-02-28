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
    <header className="bg-primary pt-12 pb-10 text-white rounded-b-[3rem] shadow-xl sticky top-0 z-50">
      <div className="container max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border-4 border-white/20 shadow-inner">
              <AvatarFallback className="bg-white/10 text-white">
                <User className="h-8 w-8" />
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-white/70 text-sm font-medium">Welcome back,</p>
              <h2 className="text-2xl md:text-3xl font-black leading-tight tracking-tight">{customerName}</h2>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="p-3 hover:bg-white/10 rounded-full transition-all active:scale-95 bg-white/5 backdrop-blur-sm"
            title="End Session"
          >
            <LogOut className="h-7 w-7" />
          </button>
        </div>
        
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="bg-accent text-accent-foreground px-4 py-1.5 text-sm md:text-base font-black rounded-xl border-none shadow-sm">
            TABLE {tableName}
          </Badge>
          <Badge variant="outline" className="border-white/30 text-white/90 px-4 py-1.5 text-xs md:text-sm font-bold rounded-xl backdrop-blur-sm">
            SESSION ACTIVE
          </Badge>
        </div>
      </div>
    </header>
  );
}
