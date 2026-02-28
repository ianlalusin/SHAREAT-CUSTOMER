"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useFirebase } from "@/firebase";

type Item = {
  id: string;
  name: string;
  category: string;
  price: number;
  imageUrl?: string | null;
};

export default function CatalogPage() {
  const { firestore } = useFirebase();
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    if (!firestore) return;
    const q = query(
      collection(firestore, "catalogItems"),
      where("isAvailable", "==", true),
      orderBy("name", "asc")
    );
    return onSnapshot(q, (snap) => {
      setItems(
        snap.docs.map((d) => {
          const x = d.data() as any;
          return {
            id: d.id,
            name: String(x.name ?? ""),
            category: String(x.category ?? ""),
            price: Number(x.price ?? 0),
            imageUrl: x.imageUrl ?? null,
          };
        })
      );
    });
  }, [firestore]);

  return (
    <main className="min-h-screen p-6 max-w-[900px] mx-auto">
      <h1 className="text-2xl font-bold mb-4">Menu</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {items.map((it) => (
          <div key={it.id} className="border rounded-2xl p-3">
            <div className="font-semibold">{it.name}</div>
            <div className="text-sm text-muted-foreground">{it.category}</div>
            <div className="mt-2 font-bold">₱{it.price}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
