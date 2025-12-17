import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/jwtAuth";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { id?: string; quantity?: number };
    if (!body?.id || typeof body.quantity !== "number")
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const prisma = getPrisma() as any;
    // ensure the item belongs to the user's cart
    const cart = await prisma.cart.findFirst({ where: { userId: user.id } });
    if (!cart)
      return NextResponse.json({ error: "Cart not found" }, { status: 404 });

    const existing = await prisma.cartItem.findUnique({
      where: { id: body.id },
    });
    if (!existing || existing.cartId !== cart.id)
      return NextResponse.json({ error: "Item not found" }, { status: 404 });

    if (body.quantity <= 0) {
      // delete the item
      await prisma.cartItem.delete({ where: { id: body.id } });
      try {
        const r = getRedis();
        if (r) await r.del(`orders:view:${user.id}`);
      } catch {}
      return NextResponse.json({ success: true, removed: true });
    }

    const updated = await prisma.cartItem.update({
      where: { id: body.id },
      data: { quantity: body.quantity },
    });
    try {
      const r = getRedis();
      if (r) await r.del(`orders:view:${user.id}`);
    } catch {}
    return NextResponse.json({ success: true, item: updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("PATCH /api/cart/update error", msg);
    return NextResponse.json(
      { error: "Server error", detail: msg },
      { status: 500 },
    );
  }
}
