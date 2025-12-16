import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { menuRepo, getMenuLastCacheStatus } from "@/lib/menuRepo";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const withRestaurants = url.searchParams.get("withRestaurants") === "1";

  if (withRestaurants) {
    // richer payload with restaurant + price; no cache for now
    const prisma = getPrisma();
    const rows = await prisma.menuItem.findMany({
      orderBy: { name: "asc" },
      take: 200,
      include: {
        restaurants: {
          include: { restaurant: true },
        },
      },
    });

    const items = rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      logoUrl: r.logoUrl ?? undefined,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      restaurants: (r.restaurants ?? []).map((mr) => ({
        id: mr.restaurantId,
        name: mr.restaurant?.name,
        priceOverride: (mr as any).priceOverride ?? undefined,
      })),
    }));

    return NextResponse.json({ items });
  }

  const rows = await menuRepo.list();

  // Respect MENU_CACHE_TTL_MS for CDN/edge caching when present. Use
  // a short browser max-age but allow CDNs (s-maxage) to cache longer.
  const ttlMs = Number(
    process.env.MENU_CACHE_TTL_MS ?? 3 * 24 * 60 * 60 * 1000,
  );
  const sMaxAge = Math.max(0, Math.floor(ttlMs / 1000));
  const cacheControl = `public, max-age=60, s-maxage=${sMaxAge}, stale-while-revalidate=60`;

  // Add X-Cache header from menuRepo (best-effort per-process value)
  const cacheStatus = getMenuLastCacheStatus() ?? "MISS";
  const xcache = cacheStatus.includes("HIT") ? "HIT" : "MISS";

  return NextResponse.json(
    { items: rows },
    {
      headers: {
        "Cache-Control": cacheControl,
        "X-Cache": xcache,
      },
    },
  );
}

export async function POST(req: NextRequest) {
  // Prevent destructive operations from being callable in production by default
  const devAdminEnabled =
    process.env.NODE_ENV !== "production" ||
    process.env.DEV_ADMIN_ENABLED === "true";
  if (!devAdminEnabled) {
    return NextResponse.json(
      { error: "Dev admin disabled in production" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const { name, slug, logoUrl, description, price } = body as {
      name?: string;
      slug?: string;
      logoUrl?: string;
      description?: string;
      price?: string;
    };

    if (!name || !slug) {
      return NextResponse.json(
        { error: "name and slug are required" },
        { status: 400 },
      );
    }

    const item = await menuRepo.upsert({ name, slug, logoUrl });

    // Note: description is not stored on MenuItem model (would require schema migration)
    // price is stored per-restaurant on MenuItemOnRestaurant.priceOverride
    // Client should use PATCH /api/menu/[id]/restaurants to set restaurant-specific prices

    return NextResponse.json({ item }, { status: 201 });
  } catch (e: unknown) {
    console.error("POST /api/menu error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const devAdminEnabled =
    process.env.NODE_ENV !== "production" ||
    process.env.DEV_ADMIN_ENABLED === "true";
  if (!devAdminEnabled) {
    return NextResponse.json(
      { error: "Dev admin disabled in production" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const { id } = body as { id?: string };

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const prisma = getPrisma();
    await prisma.menuItem.delete({ where: { id } });

    // Invalidate cache
    menuRepo.list(); // This will trigger cache refresh

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("DELETE /api/menu error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
