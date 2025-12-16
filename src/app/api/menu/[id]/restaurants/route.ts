import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function extractMenuIdFromUrl(urlStr: string) {
  try {
    const url = new URL(urlStr);
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("restaurants");
    if (idx > 0) return parts[idx - 1];
  } catch { }
  return undefined;
}

/**
 * @swagger
 * /api/menu/{id}/restaurants:
 *   post:
 *     summary: Assign restaurants to a menu item (replace assignments)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               restaurantIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Assigned rows
 */
export async function POST(req: NextRequest) {
  const id = extractMenuIdFromUrl(req.url);
  if (!id)
    return NextResponse.json({ error: "Missing menu id" }, { status: 400 });
  // Prevent destructive operations from being callable in production by default.
  // Allow when running in non-production (dev) or when DEV_ADMIN_ENABLED=true.
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
    const body = (await req.json()) as { restaurantIds?: string[]; priceOverride?: string | null };
    if (!body.restaurantIds)
      return NextResponse.json(
        { error: "Missing restaurantIds" },
        { status: 400 },
      );

    const restaurantIds = body.restaurantIds;
    const priceOverride = body.priceOverride;

    const prisma = getPrisma();

    await prisma.$transaction(async (tx) => {
      await tx.menuItemOnRestaurant.deleteMany({ where: { menuItemId: id } });
      if (restaurantIds.length > 0) {
        const data = restaurantIds.map((rid) => ({
          menuItemId: id,
          restaurantId: rid,
          priceOverride: priceOverride || null,
        }));
        await tx.menuItemOnRestaurant.createMany({ data: data as any });
      }
    });

    const assigned = await prisma.menuItemOnRestaurant.findMany({
      where: { menuItemId: id },
    });
    return NextResponse.json({ assigned });
  } catch (e: unknown) {
    console.error("POST /api/menu/[id]/restaurants error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * PATCH: Update price for a menu item at specific restaurants (don't delete other assignments)
 */
export async function PATCH(req: NextRequest) {
  const id = extractMenuIdFromUrl(req.url);
  if (!id)
    return NextResponse.json({ error: "Missing menu id" }, { status: 400 });

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
    const body = (await req.json()) as { restaurantIds?: string[]; priceOverride?: string | null };
    if (!body.restaurantIds)
      return NextResponse.json(
        { error: "Missing restaurantIds" },
        { status: 400 },
      );

    const restaurantIds = body.restaurantIds;
    const priceOverride = body.priceOverride;
    const prisma = getPrisma();

    // Update price for specified restaurants only
    const updated = await Promise.all(
      restaurantIds.map((rid) =>
        prisma.menuItemOnRestaurant.updateMany({
          where: { menuItemId: id, restaurantId: rid },
          data: ({ priceOverride: priceOverride || null } as any),
        })
      )
    );

    const assigned = await prisma.menuItemOnRestaurant.findMany({
      where: { menuItemId: id },
    });
    return NextResponse.json({ assigned, updated });
  } catch (e: unknown) {
    console.error("PATCH /api/menu/[id]/restaurants error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
