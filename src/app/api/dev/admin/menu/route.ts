import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { getUserFromRequest } from "@/lib/jwtAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const devEnabled =
  process.env.NODE_ENV !== "production" ||
  process.env.DEV_ADMIN_ENABLED === "true";

export async function POST(req: NextRequest) {
  if (!devEnabled)
    return NextResponse.json({ error: "Dev admin disabled" }, { status: 403 });
  const user = await getUserFromRequest(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { id, name, slug, logoUrl, restaurantId, price } = body as {
      id?: string;
      name: string;
      slug?: string;
      logoUrl?: string;
      restaurantId?: string;
      price?: string;
    };
    const normalize = (s: string) =>
      s
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-_]/g, "")
        .slice(0, 200);
    const slugNormalized = slug ? normalize(slug) : undefined;
    if (!name)
      return NextResponse.json({ error: "Missing name" }, { status: 400 });
    const prisma = getPrisma();

    // If a restaurantId is provided, enforce that the requester is the mapped owner (dev mapping in Redis)
    if (restaurantId) {
      try {
        const r = getRedis();
        if (r) {
          const ownerKey = `dev:restaurant:owner:${restaurantId}`;
          const ownerPhone = await r.get(ownerKey);
          if (ownerPhone && ownerPhone !== user.phone) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
          }
        }
      } catch (e) {
        // on Redis errors, be conservative and deny
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    let row;
    if (id) {
      const data: any = { name, logoUrl: logoUrl ?? null };
      if (slugNormalized) data.slug = slugNormalized;
      row = await prisma.menuItem.update({ where: { id }, data });
    } else {
      const createData = {
        name,
        slug: slugNormalized ?? normalize(name),
        logoUrl: logoUrl ?? null,
      };
      row = await prisma.menuItem.create({ data: createData });
    }

    // If restaurantId provided, ensure MenuItemOnRestaurant exists
    if (restaurantId) {
      try {
        await prisma.menuItemOnRestaurant.upsert({
          where: {
            menuItemId_restaurantId: { menuItemId: row.id, restaurantId },
          },
          update: {},
          create: { menuItemId: row.id, restaurantId },
        });
      } catch {}
    }

    // Store price in Redis under a dev key if provided
    const r2 = getRedis();
    if (r2 && price !== undefined) {
      const key = `dev:menu:price:${row.id}`;
      await r2.set(key, String(price));
    }

    return NextResponse.json({
      menuItem: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        logoUrl: row.logoUrl ?? undefined,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!devEnabled)
    return NextResponse.json({ error: "Dev admin disabled" }, { status: 403 });
  const user = await getUserFromRequest(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const prisma = getPrisma();
    const rows = await prisma.menuItem.findMany({ orderBy: { name: "asc" } });
    const items = rows.map((r: (typeof rows)[0]) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      logoUrl: r.logoUrl ?? undefined,
      createdAt: r.createdAt.getTime(),
    }));
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!devEnabled)
    return NextResponse.json({ error: "Dev admin disabled" }, { status: 403 });
  const user = await getUserFromRequest(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { id } = body as { id?: string };
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const prisma = getPrisma();
    // delete any restaurant associations first
    try {
      await prisma.menuItemOnRestaurant.deleteMany({
        where: { menuItemId: id },
      });
    } catch (e) {
      // ignore
    }
    await prisma.menuItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
