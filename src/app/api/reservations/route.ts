import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/jwtAuth";
import { getPrisma } from "@/lib/prisma";
import { listKeys, delKeys, getRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    restaurantId,
    fromDate,
    toDate,
    partySize,
    note,
    tableBreakdown,
    tablesCount,
  } = body || {};
  const user = await getUserFromRequest(req).catch(() => null);
  if (!restaurantId || !fromDate) {
    return NextResponse.json(
      { error: "restaurantId and fromDate are required" },
      { status: 400 },
    );
  }

  const requestedSize = (
    typeof partySize === "number" ? partySize : 2
  ) as number;
  const bucket =
    requestedSize <= 2
      ? 2
      : requestedSize <= 4
        ? 4
        : requestedSize <= 6
          ? 6
          : 8;
  const from = new Date(fromDate);
  const to = toDate
    ? new Date(toDate)
    : new Date(from.getTime() + 60 * 60 * 1000);

  try {
    const prisma = getPrisma() as any;
    // load per-restaurant capacity with fallback to defaults
    const capRow = await prisma.restaurantCapacity.findUnique({
      where: { restaurantId },
      select: { table2: true, table4: true, table6: true, table8: true },
    });
    const capacities: Record<2 | 4 | 6 | 8, number> = {
      2: capRow?.table2 ?? 5,
      4: capRow?.table4 ?? 5,
      6: capRow?.table6 ?? 5,
      8: capRow?.table8 ?? 5,
    };

    // Acquire advisory lock and create reservation inside a transaction to avoid races
    const lockKeyStr = `${restaurantId}:${from.toISOString()}`;
    const lockHash = (() => {
      let h = 0;
      for (let i = 0; i < lockKeyStr.length; i++)
        h = (h << 5) - h + lockKeyStr.charCodeAt(i);
      return Math.abs(h);
    })();

    await prisma.$executeRaw`SELECT pg_advisory_xact_lock(${lockHash})`;

    const row = await prisma.$transaction(async (tx: any) => {
      // Count overlapping reservations for same restaurant and same size bucket inside transaction
      const overlapping = await tx.reservation.count({
        where: {
          restaurantId,
          AND: [
            { fromDate: { lt: to } },
            {
              OR: [{ toDate: null }, { toDate: { gt: from } }],
            },
          ],
          OR: [
            { partySize: { lte: 2 } },
            { AND: [{ partySize: { gt: 2 } }, { partySize: { lte: 4 } }] },
            { AND: [{ partySize: { gt: 4 } }, { partySize: { lte: 6 } }] },
            { partySize: { gt: 6 } },
          ].slice(
            bucket === 2 ? 0 : bucket === 4 ? 1 : bucket === 6 ? 2 : 3,
            bucket === 2 ? 1 : bucket === 4 ? 2 : bucket === 6 ? 3 : 4,
          ),
        },
      });
      const capacity = capacities[bucket as 2 | 4 | 6 | 8];
      if (overlapping >= capacity) {
        throw new Error("NO_AVAILABILITY");
      }

      // Persist table breakdown metadata inside `note` as JSON to avoid schema migration.
      const notePayload: any = {};
      if (typeof note === "string" && note.trim() !== "")
        notePayload.noteText = note;
      if (tableBreakdown && typeof tableBreakdown === "object")
        notePayload.tableBreakdown = tableBreakdown;
      if (typeof tablesCount === "number")
        notePayload.tablesCount = tablesCount;

      return tx.reservation.create({
        data: {
          restaurantId,
          userId: user?.id ?? null,
          fromDate: from,
          toDate: to ?? null,
          partySize: typeof partySize === "number" ? partySize : null,
          note:
            Object.keys(notePayload).length > 0
              ? JSON.stringify(notePayload)
              : typeof note === "string"
                ? note
                : null,
        },
      });
    });

    // invalidate availability cache for this restaurant (best-effort)
    try {
      const redis = getRedis();
      if (redis) {
        const keys = await listKeys(`availability:${restaurantId}:*`);
        if (keys.length > 0) await delKeys(keys);
      }
    } catch (err) {
      console.warn("failed to invalidate availability cache", err);
    }

    const dto = {
      id: row.id,
      restaurantId: row.restaurantId,
      userId: row.userId ?? undefined,
      fromDate: new Date(row.fromDate).toISOString(),
      toDate: row.toDate ? new Date(row.toDate).toISOString() : undefined,
      partySize: row.partySize ?? undefined,
      note: row.note ?? undefined,
      createdAt: new Date(row.createdAt).toISOString(),
    };
    // Invalidate per-user orders cache so /orders reflects the new reservation immediately
    try {
      if (row.userId) {
        const redis = getRedis();
        if (redis) await redis.del(`orders:view:${row.userId}`);
      }
    } catch {}
    return NextResponse.json(dto, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "NO_AVAILABILITY") {
      return NextResponse.json(
        { error: "No availability for selected time and table size" },
        { status: 409 },
      );
    }
    console.error("Reservation creation failed", msg);
    return NextResponse.json(
      { error: "Server error", detail: msg },
      { status: 500 },
    );
  }
}
