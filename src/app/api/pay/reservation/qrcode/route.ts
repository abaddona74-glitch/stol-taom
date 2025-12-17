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
  // Use the free qrserver.com API for a quick, scannable QR image URL.
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`;
}

const QR_TOKEN_TTL_SEC = 180; // keep in sync with client countdown (3 minutes)

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const reservationId = body?.reservationId as string | undefined;
    if (!reservationId)
      return NextResponse.json(
        { error: "reservationId required" },
        { status: 400 },
      );

    const prisma = getPrisma();
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });
    if (!reservation)
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 },
      );
    if (reservation.userId !== user.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    let qrData = makeSimpleSvgDataUrl(reservationId);
    let confirmUrl: string | null = null;
    try {
      const r = getRedis();
      if (r) {
        const rand = Math.random().toString(36).slice(2);
        const basis = `${Date.now()}::${user.id}::${reservationId}::${rand}`;
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
          JSON.stringify({ kind: "reservation", id: reservationId }),
          "EX",
          QR_TOKEN_TTL_SEC,
        );
        const base = getDemoBaseUrl(req as unknown as Request);
        confirmUrl = `${base}/api/pay/demo/confirm?t=${encodeURIComponent(token)}`;
        qrData = makeSimpleSvgDataUrl(confirmUrl);
      }
    } catch {}

    const paymentRequest = {
      id: `resv-qrcode-${Date.now()}`,
      reservationId,
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
