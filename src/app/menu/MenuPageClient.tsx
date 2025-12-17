"use client";

import React from "react";
import { Toaster } from "sonner";
import { BookOpenCheck } from "lucide-react";
import { usePageTheme } from "@/lib/use-page-theme";
import MenuGrid, { type MenuItem } from "@/components/MenuGrid";
import ExplorerClient from "./ExplorerClient";

export default function MenuPageClient() {
  // Apply per-page theme from localStorage (default: light for /menu)
  usePageTheme("/menu");

  const [query, setQuery] = React.useState("");
  const [items, setItems] = React.useState<MenuItem[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // parse URL params once at effect start
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get("query") ?? "";
    if (initialQuery) setQuery(initialQuery);

    let mounted = true;
    setLoading(true);

    const restaurantId = params.get("restaurant");
    const url = restaurantId
      ? `/api/restaurants/${restaurantId}/menu`
      : "/api/menu?withRestaurants=1";

    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (!mounted) return;
        const list = (d.items || []) as Array<{
          id: string;
          name: string;
          slug?: string;
          logoUrl?: string;
          createdAt?: number;
          priceOverride?: string;
          restaurants?: Array<{
            id: string;
            name?: string;
            priceOverride?: string;
          }>;
        }>;
        const mapped: MenuItem[] = list.map((it) => ({
          id: it.id,
          name: it.name,
          slug: it.slug,
          logoUrl: it.logoUrl,
          createdAt: it.createdAt,
          price: it.restaurants?.[0]?.priceOverride ?? it.priceOverride,
          restaurantName: it.restaurants?.[0]?.name,
        }));
        setItems(mapped);
      })
      .catch(() => {
        if (!mounted) return;
        setItems([]);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="mb-6 text-2xl font-bold flex items-center gap-2">
        <BookOpenCheck className="h-6 w-6" />
        <span>Menyu</span>
      </h1>
      <Toaster position="top-right" />
      {/* Show the previous explorer/search UI first so it's visible at the top */}
      <ExplorerClient
        onQueryChange={setQuery}
        items={items?.map((it) => ({
          value: it.id,
          label: it.name,
          logo: it.logoUrl,
        }))}
        loading={loading}
      />
      <MenuGrid
        items={items ?? undefined}
        query={query}
        loading={loading}
        columns={3}
      />
    </main>
  );
}
