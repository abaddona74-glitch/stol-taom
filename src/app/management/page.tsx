"use client";
import React from "react";
import Link from "next/link";
import Image from "next/image";

export default function ManagementIndex() {
  const [restaurants, setRestaurants] = React.useState<any[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let mounted = true;
    fetch("/api/restaurants")
      .then((r) => r.json())
      .then((j) => {
        if (mounted) setRestaurants(j.items || j || []);
      })
      .catch(() => {
        if (mounted) setRestaurants([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-900 dark:to-gray-800 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-3 bg-linear-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Restaurant Management
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Choose your restaurant and sign in as a manager to access its management dashboard.
          </p>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden animate-pulse">
                <div className="h-48 bg-gray-300 dark:bg-gray-700" />
                <div className="p-6">
                  <div className="h-6 bg-gray-300 dark:bg-gray-700 rounded mb-3" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {restaurants && restaurants.length > 0 ? (
              restaurants.map((r) => (
                <Link
                  key={r.id}
                  href={`/management/restaurant/${r.id}`}
                  className="group bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 hover:-translate-y-1"
                >
                  <div className="relative h-48 bg-linear-to-br from-blue-400 to-indigo-500">
                    {r.logoUrl || r.imageUrl ? (
                      <Image
                        src={r.logoUrl || r.imageUrl}
                        alt={r.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-white text-6xl font-bold opacity-50">
                          {r.name?.charAt(0) || "R"}
                        </div>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />
                  </div>
                  <div className="p-6">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 group-hover:text-blue-600 transition-colors">
                      {r.name}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                      {r.location || "No location"}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        ID: {r.id.slice(0, 8)}...
                      </span>
                      <span className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium group-hover:bg-blue-700 transition-colors">
                        Manage →
                      </span>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="col-span-full text-center py-12">
                <div className="text-gray-400 text-lg">No restaurants found</div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
