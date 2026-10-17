"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Lot = {
  id: string;
  donor_name: string;
  item: string;
  quantity: number;
  pickup_by: string;
  status: string;
};

export default function Home() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .from("lots")
      .select("*")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setLots(data ?? []);
      });
  }, []);

  return (
    <main className="p-8">
      <h1 className="mb-4 text-3xl font-bold">FoodLoop Dispatch</h1>
      {error && <p className="text-red-600">Error: {error}</p>}
      <ul className="space-y-2">
        {lots.map((l) => (
          <li key={l.id} className="rounded border p-3">
            {l.donor_name}: {l.quantity} {l.item} ({l.status})
          </li>
        ))}
      </ul>
    </main>
  );
}