import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { getUserFromRequest } from "@/lib/jwtAuth";
import { clearRestaurantsCache } from "@/lib/restaurantRepo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const devEnabled =
  process.env.NODE_ENV !== "production" ||
  process.env.DEV_ADMIN_ENABLED === "true";

export async function GET(req: NextRequest) {
  if (!devEnabled)
    return NextResponse.json({ error: "Dev admin disabled" }, { status: 403 });
  const user = await getUserFromRequest(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const prisma = getPrisma();
    const rows = await prisma.restaurant.findMany({ orderBy: { name: "asc" } });
    const items = rows.map((r) => ({
      id: r.id,
      name: r.name,
      logoUrl: r.logoUrl ?? undefined,
      createdAt: r.createdAt.getTime(),
    }));
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!devEnabled)
    return NextResponse.json({ error: "Dev admin disabled" }, { status: 403 });
  const user = await getUserFromRequest(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { id, name, logoUrl, openTime, closeTime, ownerPhone } = body as {
      id?: string;
      name: string;
      logoUrl?: string;
      openTime?: string;
      closeTime?: string;
      ownerPhone?: string;
    };
    if (!name)
      return NextResponse.json({ error: "Missing name" }, { status: 400 });
    const prisma = getPrisma();
    let row;
    if (id) {
      // update existing
      row = await prisma.restaurant.update({
        where: { id },
        data: { name, logoUrl: logoUrl ?? null },
      });
    } else {
      // create new
      row = await prisma.restaurant.create({
        data: { name, logoUrl: logoUrl ?? null },
      });
    }

    // Invalidate caches so other pages see the new/updated restaurant immediately
    try {
      const rcli = getRedis();
      if (rcli) {
        await rcli.incr("menu:restaurants:version");
      }
    } catch (err) {
      // ignore
    }
    try {
      clearRestaurantsCache();
    } catch (err) {
      // ignore
    }
    // store open/close times in Redis as dev metadata when provided
    const r = getRedis();
    if (r && (openTime || closeTime)) {
      const key = `dev:restaurant:hours:${row.id}`;
      const payload = JSON.stringify({
        openTime: openTime ?? null,
        closeTime: closeTime ?? null,
      });
      await r.set(key, payload);
    }

    // If ownerPhone provided (dev metadata), store ownership mapping so server can enforce per-owner access
    if (r && ownerPhone) {
      const okKey = `dev:restaurant:owner:${row.id}`;
      await r.set(okKey, ownerPhone);
    }

    return NextResponse.json({
      restaurant: {
        id: row.id,
        name: row.name,
        logoUrl: row.logoUrl ?? undefined,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!devEnabled)
    return NextResponse.json({ error: "Dev admin disabled" }, { status: 403 });
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { id } = body as { id?: string };
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const prisma = getPrisma();
    await prisma.restaurant.delete({ where: { id } });

    // bump redis version so cached lists invalidate
    try {
      const r = getRedis();
      if (r) await r.incr("menu:restaurants:version");
    } catch (err) {
      // ignore
    }
    try {
      clearRestaurantsCache();
    } catch (err) {
      // ignore
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
