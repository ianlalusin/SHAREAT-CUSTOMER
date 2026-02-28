
"use client";

import { useState } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotateCcw, CheckCircle2 } from "lucide-react";
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
    <section className="px-6 py-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          Fast Refills
        </h3>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tap to Order</span>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        {refillItems.map((item) => {
          const isOnCooldown = cooldowns[item.id] && (Date.now() - cooldowns[item.id] < REFILL_COOLDOWN);
          
          return (
            <Card 
              key={item.id} 
              className="overflow-hidden border-none shadow-sm hover:shadow-md transition-all active:scale-[0.97] cursor-pointer group"
              onClick={() => handleRefill(item.id, item.name)}
            >
              <div className="relative h-24 w-full">
                <Image 
                  src={item.image} 
                  alt={item.name} 
                  fill 
                  className="object-cover transition-transform group-hover:scale-110"
                  data-ai-hint="food drink"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                {isOnCooldown && (
                   <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[1px]">
                     <RotateCcw className="text-white w-8 h-8 animate-spin-slow opacity-80" />
                   </div>
                )}
              </div>
              <CardContent className="p-3 text-center">
                <p className="font-bold text-sm truncate">{item.name}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
