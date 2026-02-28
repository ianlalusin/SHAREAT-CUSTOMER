
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard/Header";
import { FastRefills } from "@/components/dashboard/FastRefills";
import { ServiceActions } from "@/components/dashboard/ServiceActions";
import { RequestHistory, RequestRecord } from "@/components/dashboard/RequestHistory";
import { Loader2 } from "lucide-react";

export default function DashboardPage() {
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Check session
    const cookies = document.cookie.split(';');
    const sessionToken = cookies.find(c => c.trim().startsWith('session_token='));
    
    if (!sessionToken) {
      router.push("/");
      return;
    }

    // Load initial data
    setTimeout(() => {
      setIsLoaded(true);
    }, 800);

    // Mock session polling
    const interval = setInterval(() => {
      // In real app, check /api/session-status
      // If closed: router.push("/closed")
    }, 5000);

    return () => clearInterval(interval);
  }, [router]);

  const handleNewRequest = (item: string) => {
    const newReq: RequestRecord = {
      id: Math.random().toString(36).substr(2, 9),
      item: item,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: "queued"
    };
    
    setRequests(prev => [newReq, ...prev].slice(0, 10));

    // Simulate status updates
    setTimeout(() => {
      setRequests(prev => prev.map(r => r.id === newReq.id ? { ...r, status: "accepted" } : r));
      
      setTimeout(() => {
        setRequests(prev => prev.map(r => r.id === newReq.id ? { ...r, status: "preparing" } : r));
        
        setTimeout(() => {
          setRequests(prev => prev.map(r => r.id === newReq.id ? { ...r, status: "served" } : r));
        }, 5000);
      }, 3000);
    }, 2000);
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen pb-10 flex flex-col">
      <DashboardHeader 
        customerName="Johnathan" 
        tableName="B12" 
      />
      
      <div className="flex-1 bg-background">
        <FastRefills onRefillRequested={handleNewRequest} />
        
        <div className="px-6 py-2">
          <div className="h-px bg-zinc-200 w-full" />
        </div>

        <ServiceActions onServiceRequested={handleNewRequest} />

        <div className="px-6 py-2">
          <div className="h-px bg-zinc-200 w-full" />
        </div>

        <RequestHistory requests={requests} />
      </div>

      <nav className="fixed bottom-0 left-0 right-0 max-w-[500px] mx-auto bg-white/80 backdrop-blur-md border-t border-zinc-100 px-6 h-20 flex items-center justify-around z-50">
        <button className="flex flex-col items-center gap-1 text-primary">
          <div className="bg-primary/10 p-2 rounded-xl">
             <UtensilsCrossed className="h-6 w-6" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest">Home</span>
        </button>
        <button 
           className="flex flex-col items-center gap-1 text-muted-foreground"
           onClick={() => {}}
        >
          <div className="p-2">
            <History className="h-6 w-6" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest">History</span>
        </button>
      </nav>
    </main>
  );
}

function UtensilsCrossed(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8" />
      <path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3a4.2 4.2 0 0 0 6 0L20 13.5" />
      <line x1="9" x2="15" y1="21" y2="15" />
    </svg>
  );
}
