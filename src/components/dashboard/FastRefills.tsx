"use client";

import { useState } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PlaceHolderImages } from "@/lib/placeholder-images";

const REFILL_COOLDOWN = 60000; // 60 seconds

export function FastRefills({ onRefillRequested }: { onRefillRequested: (item: string) => void }) {
  const { toast } = useToast();
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});

  const refillItems = [
    { id: "cola", name: "Classic Cola", image: PlaceHolderImages.find(i => i.id === "item-cola")?.imageUrl || "" },
    { id: "fries", name: "House Fries", image: PlaceHolderImages.find(i => i.id === "item-fries")?.imageUrl || "" },
    { id: "water", name: "Sparkling Water", image: PlaceHolderImages.find(i => i.id === "item-water")?.imageUrl || "" },
    { id: "bread", name: "Garlic Bread", image: PlaceHolderImages.find(i => i.id === "item-bread")?.imageUrl || "" },
  ];

  const handleRefill = (itemId: string, itemName: string) => {
    const now = Date.now();
    if (cooldowns[itemId] && now - cooldowns[itemId] < REFILL_COOLDOWN) {
      const remaining = Math.ceil((REFILL_COOLDOWN - (now - cooldowns[itemId])) / 1000);
      toast({
        variant: "destructive",
        title: "Wait a moment",
        description: `Please wait ${remaining}s before requesting another ${itemName} refill.`,
      });
      return;
    }

    setCooldowns(prev => ({ ...prev, [itemId]: now }));
    onRefillRequested(itemName);
    
    toast({
      title: "Request Sent",
      description: `Your ${itemName} refill is on the way!`,
    });
  };

  return (
    <section className="py-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-black tracking-tight">
          Fast Refills
        </h3>
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-zinc-100 px-3 py-1 rounded-full">Tap to Order</span>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {refillItems.map((item) => {
          const isOnCooldown = cooldowns[item.id] && (Date.now() - cooldowns[item.id] < REFILL_COOLDOWN);
          
          return (
            <Card 
              key={item.id} 
              className="overflow-hidden border-none shadow-sm hover:shadow-xl transition-all active:scale-[0.97] cursor-pointer group rounded-[2rem] bg-white"
              onClick={() => handleRefill(item.id, item.name)}
            >
              <div className="relative h-32 md:h-40 w-full">
                <Image 
                  src={item.image} 
                  alt={item.name} 
                  fill 
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                  data-ai-hint="food drink"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                {isOnCooldown && (
                   <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[2px]">
                     <RotateCcw className="text-white w-10 h-10 animate-spin-slow" />
                   </div>
                )}
                <div className="absolute bottom-3 left-0 right-0 px-3">
                  <p className="font-black text-white text-sm md:text-base truncate drop-shadow-md">{item.name}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
