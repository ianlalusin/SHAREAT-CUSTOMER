
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
    <header className="bg-primary pt-12 pb-8 px-6 text-white rounded-b-[2rem] shadow-lg sticky top-0 z-50">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12 border-2 border-white/20">
            <AvatarFallback className="bg-white/10 text-white">
              <User className="h-6 w-6" />
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-white/80 text-sm font-medium">Welcome back,</p>
            <h2 className="text-xl font-bold leading-tight">{customerName}</h2>
          </div>
        </div>
        <button 
          onClick={handleLogout}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
        >
          <LogOut className="h-6 w-6" />
        </button>
      </div>
      
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="bg-accent text-accent-foreground px-3 py-1 text-sm font-bold rounded-lg border-none">
          TABLE {tableName}
        </Badge>
        <Badge variant="outline" className="border-white/30 text-white/90 px-3 py-1 text-xs font-semibold rounded-lg">
          SESSION ACTIVE
        </Badge>
      </div>
    </header>
  );
}
