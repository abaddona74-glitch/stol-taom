import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/jwtAuth";
import { getRedis } from "@/lib/redis";
function getDemoBaseUrl(req: Request) {
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function makeSimpleSvgDataUrl(text: string) {
  // For a fast, usable demo QR we use the free qrserver.com generator.
  // This returns a direct image URL which the client can use in an <img>.
  // Replace with an internal generator or payment provider integration in production.
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`;
}

const QR_TOKEN_TTL_SEC = 180; // keep in sync with client countdown (3 minutes)

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const orderId = body?.orderId as string | undefined;
    if (!orderId)
      return NextResponse.json({ error: "orderId required" }, { status: 400 });

    const prisma = getPrisma();
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order)
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (order.userId !== user.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Demo: create one-time confirm token and encode its URL in QR
    let qrData = makeSimpleSvgDataUrl(orderId);
    let confirmUrl: string | null = null;
    try {
      const r = getRedis();
      if (r) {
        // Unique token: hash of time + user + order + random
        const rand = Math.random().toString(36).slice(2);
        const basis = `${Date.now()}::${user.id}::${orderId}::${rand}`;
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
          JSON.stringify({ kind: "order", id: orderId }),
          "EX",
          QR_TOKEN_TTL_SEC,
        );
        const base = getDemoBaseUrl(req as unknown as Request);
        confirmUrl = `${base}/api/pay/demo/confirm?t=${encodeURIComponent(token)}`;
        qrData = makeSimpleSvgDataUrl(confirmUrl);
      }
    } catch {}

    const paymentRequest = {
      id: `qrcode-${Date.now()}`,
      orderId,
      method: "qrcode",
      status: "pending",
      qrData,
      confirmUrl,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json({ paymentRequest });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Server error", detail: msg },
      { status: 500 },
    );
  }
}
