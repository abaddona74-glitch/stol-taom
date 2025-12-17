import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { dbTry } from "@/lib/dbTry";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: "Restaurant ID required" },
      { status: 400 },
    );
  }

  try {
    const restaurant = await dbTry(() =>
      prisma.restaurant.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          logoUrl: true,
          createdAt: true,
        },
      }),
    );

    if (!restaurant) {
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      id: restaurant.id,
      name: restaurant.name,
      logoUrl: restaurant.logoUrl ?? undefined,
      createdAt: restaurant.createdAt.getTime(),
    });
  } catch (err) {
    console.error("GET /api/restaurants/[id] error", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
