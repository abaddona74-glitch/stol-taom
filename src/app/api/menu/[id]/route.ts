import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { menuDetailRepo } from "@/lib/menuDetailRepo";
import { menuRepo } from "@/lib/menuRepo";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * @swagger
 * /api/menu/{id}:
 *   get:
 *     summary: Get full detail for a menu item (description, ingredients, restaurants)
 *     description: Cached endpoint - returns clean data with 1-day cache TTL
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Menu item detail with caching headers
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    // expected: ["api","menu","<id>"]
    const id = parts[2];
    if (!id)
      return NextResponse.json({ error: "Missing menu id" }, { status: 400 });

    // Get from cache (memory → Redis → database)
    const detail = await menuDetailRepo.getById(id);
    if (!detail)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Aggressive caching: 1 day in browser, longer on CDN
    const ttlMs = Number(
      process.env.MENU_DETAIL_CACHE_TTL_MS ?? 24 * 60 * 60 * 1000,
    );
    const sMaxAge = Math.max(0, Math.floor(ttlMs / 1000));
    const cacheControl = `public, max-age=3600, s-maxage=${sMaxAge}, stale-while-revalidate=60`;

    return NextResponse.json(
      { ...detail },
      {
        headers: {
          "Cache-Control": cacheControl,
        },
      },
    );
  } catch (e: unknown) {
    console.error("GET /api/menu/[id] error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
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
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const id = parts[2];
    if (!id)
      return NextResponse.json({ error: "Missing menu id" }, { status: 400 });

    const body = await req.json();
    const { name, slug, logoUrl } = body as {
      name?: string;
      slug?: string;
      logoUrl?: string;
    };

    if (!name && !slug && !logoUrl) {
      return NextResponse.json(
        {
          error: "At least one field (name/slug/logoUrl) to update is required",
        },
        { status: 400 },
      );
    }

    const prisma = getPrisma();
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slug;
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl || null;

    const updated = await prisma.menuItem.update({
      where: { id },
      data: updateData,
    });

    // Invalidate cache
    menuRepo.list();

    return NextResponse.json({ item: updated });
  } catch (e: unknown) {
    console.error("PUT /api/menu/[id] error", e);
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
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const id = parts[2];
    if (!id)
      return NextResponse.json({ error: "Missing menu id" }, { status: 400 });

    const prisma = getPrisma();
    await prisma.menuItem.delete({ where: { id } });

    // Invalidate cache
    menuRepo.list();

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("DELETE /api/menu/[id] error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
