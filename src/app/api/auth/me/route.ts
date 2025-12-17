/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current authenticated user
 *     description: Returns the current user if access token is valid. If only refresh exists, it may mint a new access token.
 *     tags: [Auth]
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Authenticated user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 authenticated:
 *                   type: boolean
 *                 user:
 *                   type: object
 *       401:
 *         description: Not authenticated
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import {
  ACCESS_TOKEN_NAME,
  ACCESS_TTL_SEC,
  getUserFromRequest,
  refreshAccessToken,
  getUserRoles,
} from "@/lib/jwtAuth";

export async function GET(req: NextRequest) {
  try {
    // Try access token
    const tokenUser = await getUserFromRequest(req);
    if (tokenUser) {
      // Try to read cached user profile from Redis first to avoid DB hit
      const r = getRedis();
      const userCacheKey = `user:${tokenUser.id}`;
      let dbUser = null;
      if (r) {
        try {
          const raw = await r.get(userCacheKey);
          if (raw) dbUser = JSON.parse(raw);
        } catch {
          dbUser = null;
        }
      }
      if (!dbUser) {
        dbUser = await prisma.user.findUnique({
          where: { id: tokenUser.id },
          select: { id: true, phone: true, name: true, email: true },
        });
        if (r && dbUser) {
          try {
            const ttl = Number(process.env.USER_CACHE_TTL_SECONDS || "60");
            await r.set(
              userCacheKey,
              JSON.stringify(dbUser),
              "EX",
              Math.max(10, ttl),
            );
          } catch {
            // ignore cache set errors
          }
        }
      }
      if (dbUser) {
        const roles = await getUserRoles(tokenUser.id).catch(() => []);
        return NextResponse.json({
          authenticated: true,
          user: {
            id: dbUser.id,
            phone: dbUser.phone,
            name: dbUser.name,
            email: dbUser.email,
            roles,
          },
        });
      }
    }

    // Try refresh to mint new access (without using NextResponse.next in app routes)
    const refreshed = await refreshAccessToken(req);
    if (refreshed?.user) {
      // Try to read cached user profile from Redis first
      const r2 = getRedis();
      const userCacheKey2 = `user:${String(refreshed.user.id)}`;
      let dbUser = null;
      if (r2) {
        try {
          const raw = await r2.get(userCacheKey2);
          if (raw) dbUser = JSON.parse(raw);
        } catch {
          dbUser = null;
        }
      }
      if (!dbUser) {
        dbUser = await prisma.user.findUnique({
          where: { id: refreshed.user.id },
          select: { id: true, phone: true, name: true, email: true },
        });
        if (r2 && dbUser) {
          try {
            const ttl = Number(process.env.USER_CACHE_TTL_SECONDS || "60");
            await r2.set(
              userCacheKey2,
              JSON.stringify(dbUser),
              "EX",
              Math.max(10, ttl),
            );
          } catch {
            // ignore cache set errors
          }
        }
      }
      if (!dbUser)
        return NextResponse.json({ authenticated: false }, { status: 401 });
      const roles = await getUserRoles(String(refreshed.user.id)).catch(
        () => [],
      );
      const res = NextResponse.json({
        authenticated: true,
        user: {
          id: dbUser.id,
          phone: dbUser.phone,
          name: dbUser.name,
          email: dbUser.email,
          roles,
        },
        refreshed: true,
      });
      // Set cookies on this response
      const cookieSecureEnv = process.env.COOKIE_SECURE?.toLowerCase();
      const cookieSecure =
        cookieSecureEnv === "true"
          ? true
          : cookieSecureEnv === "false"
            ? false
            : process.env.NODE_ENV === "production";
      const base = {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: cookieSecure,
      };
      res.cookies.set(ACCESS_TOKEN_NAME, refreshed.access, {
        ...base,
        maxAge: ACCESS_TTL_SEC,
      });
      // Note: refreshAccessToken may have rotated refresh; since we didn't get the new token value here,
      // rotation on registry is optional and access is the critical cookie. If needed, we can extend the
      // function to return the rotated refresh token in the future.
      res.headers.set("x-auth-me", "refreshed");
      return res;
    }
    return NextResponse.json({ authenticated: false }, { status: 401 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { authenticated: false, error: String(msg) },
      { status: 401 },
    );
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
