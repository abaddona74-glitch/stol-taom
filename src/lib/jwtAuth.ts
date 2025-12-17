import type { JWTPayload } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPrisma } from "./prisma";
import { getRedis } from "./redis";

// Lazy import jose to avoid issues in Edge Runtime
async function getJose() {
  return await import("jose");
}

// Cookie names and TTLs
export const ACCESS_TOKEN_NAME = "access_token";
export const REFRESH_TOKEN_NAME = "refresh_token";

// Allow env-based overrides for testing or ops
function readSeconds(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

// Defaults: access 15 minutes, refresh 14 days
export const ACCESS_TTL_SEC = readSeconds("ACCESS_TTL_SECONDS", 60 * 15);
export const REFRESH_TTL_SEC = readSeconds(
  "REFRESH_TTL_SECONDS",
  60 * 60 * 24 * 14,
);

type PublicUser = { id: string; phone: string; name?: string };

// Cache the encoded secret key to avoid re-encoding on every call
let cachedSecretKey: Uint8Array | null = null;

function getSecretKey() {
  // Return cached key if available
  if (cachedSecretKey) return cachedSecretKey;

  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    const msg = "JWT_SECRET and NEXTAUTH_SECRET are both unset";
    throw new Error(msg);
  }
  try {
    cachedSecretKey = new TextEncoder().encode(secret);
    return cachedSecretKey;
  } catch (err) {
    throw new Error(`Failed to encode JWT secret: ${String(err)}`);
  }
}

function newJti() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function getRefreshRepo() {
  // Avoid importing Node-only code in Edge (middleware)
  if ((globalThis as unknown as { EdgeRuntime?: boolean }).EdgeRuntime)
    return null;
  try {
    const mod = await import("./refreshRepo");
    return (mod as unknown as { refreshRepo?: unknown }).refreshRepo as {
      store: (jti: string, userId: string, ttlSec: number) => Promise<unknown>;
      exists: (jti: string) => Promise<boolean>;
      revoke: (jti: string) => Promise<unknown>;
      rotate: (
        oldJti: string,
        newJti: string,
        userId: string,
        ttlSec: number,
      ) => Promise<unknown>;
    };
  } catch {
    return null;
  }
}

export async function signAccessToken(user: PublicUser) {
  const { SignJWT } = await getJose();
  const key = getSecretKey();
  return await new SignJWT({
    sub: user.id,
    phone: user.phone,
    name: user.name,
    typ: "access",
  } as JWTPayload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(key);
}

export async function signRefreshToken(user: PublicUser, jti?: string) {
  const { SignJWT } = await getJose();
  const key = getSecretKey();
  const tokenJti = jti || newJti();
  return await new SignJWT({
    sub: user.id,
    phone: user.phone,
    name: user.name,
    typ: "refresh",
    jti: tokenJti,
  } as JWTPayload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL_SEC}s`)
    .sign(key);
}

export async function verifyToken(token: string) {
  const { jwtVerify } = await getJose();
  const key = getSecretKey();
  const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
  return payload as JWTPayload & {
    sub?: string;
    phone?: string;
    name?: string;
    typ?: string;
  };
}

export function extractBearer(req: NextRequest) {
  const h =
    req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const [scheme, token] = h.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

export async function getUserFromRequest(
  req: NextRequest,
): Promise<PublicUser | null> {
  try {
    const token =
      req.cookies.get(ACCESS_TOKEN_NAME)?.value || extractBearer(req);
    if (!token) return null;
    const payload = await verifyToken(token);
    if (!payload?.sub || !payload.phone) return null;
    return { id: payload.sub, phone: payload.phone, name: payload.name };
  } catch {
    return null;
  }
}

// ----- Role loading and helpers -----
export type LoadedUserRole = {
  name: string; // role name from Role.name
  scopeType: string; // 'global' | 'restaurant' | 'branch'
  scopeId?: string | null;
};

const ROLE_CACHE_TTL_SEC = Number(process.env.ROLE_CACHE_TTL_SECONDS || "60");

export async function getUserRoles(userId: string): Promise<LoadedUserRole[]> {
  const r = getRedis();
  const cacheKey = `userroles:${userId}`;
  if (r) {
    try {
      const raw = await r.get(cacheKey);
      if (raw) return JSON.parse(raw) as LoadedUserRole[];
    } catch {
      // ignore cache errors
    }
  }
  const prisma = getPrisma();
  const rows = await prisma.userRole.findMany({
    where: { userId },
    include: { role: true },
  });
  const out: LoadedUserRole[] = rows.map((rr) => ({
    name: rr.role.name,
    scopeType: rr.scopeType,
    scopeId: rr.scopeId ?? null,
  }));
  if (r) {
    try {
      await r.set(
        cacheKey,
        JSON.stringify(out),
        "EX",
        Math.max(10, ROLE_CACHE_TTL_SEC),
      );
    } catch {
      // ignore cache set errors
    }
  }
  return out;
}

export function userHasRole(
  roles: LoadedUserRole[],
  roleName: string,
  opts?: { scopeType?: string; scopeId?: string | null },
): boolean {
  for (const r of roles) {
    if (r.name !== roleName) continue;
    if (!opts || !opts.scopeType) return true; // any-scope match
    if (r.scopeType === "global") return true; // global role overrides
    if (r.scopeType === opts.scopeType) {
      // if scopeId not provided, match any within the scopeType
      if (!opts.scopeId) return true;
      if (r.scopeId && opts.scopeId && r.scopeId === opts.scopeId) return true;
    }
  }
  return false;
}

export async function hasRoleForUser(
  userId: string,
  roleName: string,
  opts?: { scopeType?: string; scopeId?: string | null },
): Promise<boolean> {
  const roles = await getUserRoles(userId);
  return userHasRole(roles, roleName, opts);
}

export async function issueAndSetAuthCookies(
  res: NextResponse,
  user: PublicUser,
) {
  const [access, refresh] = await Promise.all([
    signAccessToken(user),
    signRefreshToken(user),
  ]);
  // If Redis is enabled, persist refresh JTI
  try {
    const payload = await verifyToken(refresh);
    const payloadObj = payload as Record<string, unknown> | undefined;
    if (payloadObj?.jti && payload.sub) {
      const repo = await getRefreshRepo();
      if (repo)
        await repo.store(
          String(payloadObj.jti),
          String(payload.sub),
          REFRESH_TTL_SEC,
        );
    }
  } catch {
    // ignore
  }
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
  res.cookies.set(ACCESS_TOKEN_NAME, access, {
    ...base,
    maxAge: ACCESS_TTL_SEC,
  });
  res.cookies.set(REFRESH_TOKEN_NAME, refresh, {
    ...base,
    maxAge: REFRESH_TTL_SEC,
  });
  return { access, refresh };
}

export function clearAuthCookies(res: NextResponse) {
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
  res.cookies.set(ACCESS_TOKEN_NAME, "", { ...base, maxAge: 0 });
  res.cookies.set(REFRESH_TOKEN_NAME, "", { ...base, maxAge: 0 });
}

export async function refreshAccessToken(req: NextRequest, res?: NextResponse) {
  const refresh = req.cookies.get(REFRESH_TOKEN_NAME)?.value;
  if (!refresh) return null;
  try {
    const payload = await verifyToken(refresh);
    if (!payload?.sub || !payload.phone) return null;
    // If Redis is enabled, require the JTI to exist. Rotate only if we can also set cookie on response
    if (
      payload.typ === "refresh" &&
      (payload as Record<string, unknown>)?.jti !== undefined
    ) {
      const jti = String((payload as Record<string, unknown>)?.jti || "");
      if (jti) {
        const repo = await getRefreshRepo();
        let ok = true;
        try {
          ok = repo ? await repo.exists(jti) : true;
        } catch {
          // Redis unavailable or error: fallback to stateless behavior
          ok = true;
        }
        if (!ok) return null; // revoked or missing
        if (res) {
          // rotate: delete old, issue new, and set cookie
          const userForRt: PublicUser = {
            id: payload.sub,
            phone: payload.phone,
            name: payload.name,
          };
          const nextJti = newJti();
          const newRefresh = await signRefreshToken(userForRt, nextJti);
          try {
            if (repo)
              await repo.rotate(jti, nextJti, userForRt.id, REFRESH_TTL_SEC);
          } catch {
            // ignore rotation errors
          }
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
          res.cookies.set(REFRESH_TOKEN_NAME, newRefresh, {
            ...base,
            maxAge: REFRESH_TTL_SEC,
          });
        }
      }
    }
    const user: PublicUser = {
      id: payload.sub,
      phone: payload.phone,
      name: payload.name,
    };
    const access = await signAccessToken(user);
    if (res) {
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
      res.cookies.set(ACCESS_TOKEN_NAME, access, {
        ...base,
        maxAge: ACCESS_TTL_SEC,
      });
    }
    return { access, user };
  } catch {
    return null;
  }
}

// ===== Centralized route protection control =====
// Edit only this section to manage which routes are protected.
export type PathRule = string | RegExp;

function normalizePath(p: string) {
  if (!p) return "/";
  // keep root as '/'; strip trailing slash for others
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

export const AuthControl = {
  // Pages that require login (exact match or prefix with *; RegExp supported)
  protectedPages: ["/profile", "/orders", "/dev/admin*"] as PathRule[],
  // API routes that require login
  protectedApi: [
    "/api/reservations",
    // '/api/profile*',
    // /^\/api\/orders(\/.*)?$/,
  ] as PathRule[],
  // Public pages (optional allowlist)
  publicPages: ["/", "/login", "/register", "/verify"] as PathRule[],
  // Where to redirect unauthenticated page requests
  loginPath: "/login",
};

function matchPath(pathname: string, rules: PathRule[]): boolean {
  const path = normalizePath(pathname);
  for (const r of rules) {
    if (typeof r === "string") {
      const rule = normalizePath(r);
      if (rule.endsWith("*")) {
        const prefix = rule.slice(0, -1);
        if (path.startsWith(prefix)) return true;
      } else if (path === rule) return true;
    } else if (r instanceof RegExp) {
      if (r.test(path)) return true;
    }
  }
  return false;
}

export async function authGuard(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const dev = process.env.NODE_ENV !== "production";
  // If user hits landing ("/") and already authenticated (valid access token),
  // redirect them to /home. If no/expired token, keep the landing page visible.
  if (!isApi && normalizePath(pathname) === "/") {
    const user = await getUserFromRequest(req);
    if (user) {
      const url = req.nextUrl.clone();
      url.pathname = "/home";
      url.search = "";
      const redir = NextResponse.redirect(url);
      if (dev)
        redir.headers.set(
          "x-auth-debug",
          JSON.stringify({
            path: pathname,
            landing: true,
            authed: true,
            action: "redirect-home",
            via: "access",
          }),
        );
      return redir;
    }
    // Try to refresh on landing: if refresh is valid, mint access and redirect to /home
    const url = req.nextUrl.clone();
    url.pathname = "/home";
    url.search = "";
    const redir = NextResponse.redirect(url);
    const refreshed = await refreshAccessToken(req, redir);
    if (refreshed?.user) {
      if (dev)
        redir.headers.set(
          "x-auth-debug",
          JSON.stringify({
            path: pathname,
            landing: true,
            authed: true,
            action: "redirect-home",
            via: "refresh",
          }),
        );
      return redir;
    }
    const pass = NextResponse.next();
    if (dev)
      pass.headers.set(
        "x-auth-debug",
        JSON.stringify({
          path: pathname,
          landing: true,
          authed: false,
          action: "show-landing",
        }),
      );
    return pass;
  }

  // If user navigates to the configured login page while already authenticated,
  // send them to /home. This mirrors the landing-page behavior so users who
  // accidentally visit /login while logged in are redirected.
  if (
    !isApi &&
    normalizePath(pathname) === normalizePath(AuthControl.loginPath)
  ) {
    const userAlready = await getUserFromRequest(req);
    if (userAlready) {
      const url = req.nextUrl.clone();
      url.pathname = "/home";
      url.search = "";
      const redir = NextResponse.redirect(url);
      if (dev)
        redir.headers.set(
          "x-auth-debug",
          JSON.stringify({
            path: pathname,
            login: true,
            authed: true,
            action: "redirect-home-from-login",
            via: "access",
          }),
        );
      return redir;
    }

    // Try to refresh and redirect if refresh token is valid
    const url2 = req.nextUrl.clone();
    url2.pathname = "/home";
    url2.search = "";
    const redir2 = NextResponse.redirect(url2);
    const refreshed = await refreshAccessToken(req, redir2);
    if (refreshed?.user) {
      if (dev)
        redir2.headers.set(
          "x-auth-debug",
          JSON.stringify({
            path: pathname,
            login: true,
            authed: true,
            action: "redirect-home-from-login",
            via: "refresh",
          }),
        );
      return redir2;
    }

    const passLogin = NextResponse.next();
    if (dev)
      passLogin.headers.set(
        "x-auth-debug",
        JSON.stringify({
          path: pathname,
          login: true,
          authed: false,
          action: "show-login",
        }),
      );
    return passLogin;
  }
  const isPublic = matchPath(pathname, AuthControl.publicPages);
  const needsAuth = isApi
    ? matchPath(pathname, AuthControl.protectedApi)
    : matchPath(pathname, AuthControl.protectedPages);

  // dev is defined above

  if (!needsAuth || isPublic) {
    const res = NextResponse.next();
    if (dev)
      res.headers.set(
        "x-auth-debug",
        JSON.stringify({ path: pathname, isApi, needsAuth, isPublic }),
      );
    return res;
  }

  // Try access token
  const user = await getUserFromRequest(req);
  if (user) {
    const res = NextResponse.next();
    if (dev)
      res.headers.set(
        "x-auth-debug",
        JSON.stringify({
          path: pathname,
          isApi,
          needsAuth,
          isPublic,
          authed: true,
        }),
      );
    return res;
  }

  // Try refresh token to mint new access
  if (isApi) {
    const res = NextResponse.next();
    const refreshed = await refreshAccessToken(req, res);
    if (refreshed?.user) return res;
  } else {
    const url = req.nextUrl.clone();
    const res = NextResponse.redirect(url);
    const refreshed = await refreshAccessToken(req, res);
    if (refreshed?.user) return res;
  }

  // Unauthenticated
  if (isApi) {
    const body = { error: "Unauthorized" };
    const res = NextResponse.json(body, { status: 401 });
    if (dev)
      res.headers.set(
        "x-auth-debug",
        JSON.stringify({
          path: pathname,
          isApi,
          needsAuth,
          isPublic,
          authed: false,
        }),
      );
    return res;
  }
  const url = req.nextUrl.clone();
  url.pathname = AuthControl.loginPath;
  url.search = search
    ? `?from=${encodeURIComponent(pathname + search)}`
    : `?from=${encodeURIComponent(pathname)}`;
  const redir = NextResponse.redirect(url);
  if (dev)
    redir.headers.set(
      "x-auth-debug",
      JSON.stringify({
        path: pathname,
        isApi,
        needsAuth,
        isPublic,
        authed: false,
        action: "redirect-login",
      }),
    );
  return redir;
}
