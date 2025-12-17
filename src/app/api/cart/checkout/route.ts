import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/jwtAuth";
import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";

function getDemoBaseUrl(req: Request) {
  // Prefer explicit env; otherwise derive from request headers for portability
  const envBase = process.env.DEMO_BASE_URL;
  if (envBase) return envBase.replace(/\/$/, "");
  const h = req.headers as any;
  const host =
    h.get?.("x-forwarded-host") || h.get?.("host") || "localhost:3000";
  const proto =
    h.get?.("x-forwarded-proto") ||
    (host.startsWith("localhost") ? "http" : "http");
  return `${proto}://${host}`;
}

function makeSimpleSvgDataUrl(text: string) {
  // Use external QR generator for a fast, scannable image in demo mode.
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.ids) ? (body.ids as string[]) : undefined;

    const prisma = getPrisma() as any;

    // load cart for user
    const cart = await prisma.cart.findFirst({
      where: { userId: user.id },
      include: { items: true },
    });
    const rawItems = (cart?.items ?? []) as any[];
    // Accept either server-side cart item `id` or client-generated `clientItemId` in the provided ids.
    const toCheckout =
      ids && ids.length > 0
        ? rawItems.filter(
            (it) =>
              ids.includes(it.id) ||
              (it.clientItemId && ids.includes(it.clientItemId)),
          )
        : rawItems;
    if (!toCheckout || toCheckout.length === 0)
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });

    // Build order items and try to infer restaurantId from MenuItemOnRestaurant
    const orderItemsData = [] as any[];
    for (const it of toCheckout) {
      // Prefer the restaurantId stored on the cart item (set when item was added)
      let restaurantId: string | null = it.restaurantId ?? null;
      if (!restaurantId) {
        try {
          const link = await prisma.menuItemOnRestaurant.findFirst({
            where: { menuItemId: it.menuItemId },
            select: { restaurantId: true },
          });
          if (link?.restaurantId) restaurantId = link.restaurantId;
        } catch {}
      }
      orderItemsData.push({
        menuItemId: it.menuItemId,
        name: it.name,
        ingredients:
          typeof it.ingredients === "string"
            ? JSON.parse(it.ingredients)
            : (it.ingredients ?? null),
        quantity: it.quantity,
        price: it.price ?? null,
        restaurantId,
      });
    }

    // create order and order items in transaction, then remove cart items
    const result = await prisma.$transaction(async (tx: any) => {
      const created = await tx.order.create({
        data: {
          userId: user.id,
          status: "pending",
          paymentMethod: body?.paymentMethod ?? "counter",
        },
      });
      for (const oi of orderItemsData) {
        await tx.orderItem.create({
          data: {
            orderId: created.id,
            restaurantId: oi.restaurantId,
            menuItemId: oi.menuItemId,
            name: oi.name,
            ingredients: oi.ingredients,
            quantity: oi.quantity,
            price: oi.price,
          },
        });
      }
      // delete checked out cart items
      const itemIds = toCheckout.map((x) => x.id);
      if (itemIds.length > 0)
        await tx.cartItem.deleteMany({ where: { id: { in: itemIds } } });
      return created;
    });
    // Invalidate per-user orders cache
    try {
      const r = getRedis();
      if (r) await r.del(`orders:view:${user.id}`);
    } catch {}

    // notify via BroadcastChannel (best-effort) so same-browser tabs update
    try {
      const bc = new BroadcastChannel("orders");
      bc.postMessage({ type: "orders:update" });
      bc.close();
    } catch {}

    // If the client requested an immediate QR payload for convenience, include it here
    const extra: any = {};
    try {
      const pm = body?.paymentMethod;
      if (pm === "qrcode") {
        // Create one-time confirm token in Redis for demo payment confirmation (unique, time+user+order+random)
        const r = getRedis();
        if (r) {
          const rand = Math.random().toString(36).slice(2);
          const basis = `${Date.now()}::${user.id}::${result.id}::${rand}`;
          const token = Buffer.from(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(basis),
            ),
          )
            .toString("hex")
            .slice(0, 32);
          const key = `pay:demo:token:${token}`;
          // Token valid for 2 minutes
          await r.set(
            key,
            JSON.stringify({ kind: "order", id: result.id }),
            "EX",
            120,
          );
          const base = getDemoBaseUrl(req as unknown as Request);
          const confirmUrl = `${base}/api/pay/demo/confirm?t=${encodeURIComponent(token)}`;
          // Encode the payment URL in QR
          extra.qrData = makeSimpleSvgDataUrl(confirmUrl);
        } else {
          // Fallback: encode the raw order id (still scannable URL-less)
          extra.qrData = makeSimpleSvgDataUrl(result.id);
        }
      }
    } catch {}

    return NextResponse.json(
      { id: result.id, status: result.status, ...extra },
      { status: 201 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("POST /api/cart/checkout error", msg);
    return NextResponse.json(
      { error: "Server error", detail: msg },
      { status: 500 },
    );
  }
}
