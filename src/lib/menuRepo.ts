import { dbTry } from "./dbTry";
import { prisma } from "./prisma";
import { getRedis } from "./redis";

export type MenuItemDTO = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  createdAt: string;
};

export type MenuItemFull = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export const menuRepo = {
  // in-memory cache for menu list
  // TTL (ms) configurable via MENU_CACHE_TTL_MS (default 3 days)
  async list(limit = 100): Promise<MenuItemDTO[]> {
    const ttlMs = Number(
      process.env.MENU_CACHE_TTL_MS ?? 3 * 24 * 60 * 60 * 1000,
    );
    // module-scoped cache (defined below)
    if (menuListCache.value && Date.now() - menuListCache.ts < ttlMs) {
      lastCacheStatus = "HIT:memory";
      // eslint-disable-next-line no-console
      console.info("[menuRepo:cache] HIT memory");
      return menuListCache.value.slice(0, limit);
    }

    const r = getRedis();

    // Stale-while-revalidate: use versioned redis keys (menu:list:v:<ver>:limit:<limit>)
    const refreshAheadMs = Number(
      process.env.MENU_CACHE_REFRESH_AHEAD_MS ?? 2 * 60 * 1000,
    );

    // Try Redis first when available
    if (r) {
      try {
        const verRaw = await r.get("menu:list:version");
        const ver = verRaw ? Number(verRaw) : 0;
        const redisKey = `menu:list:v:${ver}:limit:${limit}`;
        const cached = await r.get(redisKey);
        if (cached) {
          const parsed = JSON.parse(cached) as MenuItemDTO[];
          menuListCache.value = parsed;
          menuListCache.ts = Date.now();
          lastCacheStatus = "HIT:redis";
          // eslint-disable-next-line no-console
          console.info("[menuRepo:cache] HIT redis", redisKey);

          // If TTL is low, trigger a background refresh with a lock
          try {
            const pttl = await r.pttl(redisKey); // ms remaining
            if (pttl >= 0 && pttl < refreshAheadMs) {
              const lockKey = `menu:list:refreshing:limit:${limit}`;
              const lockSet = await r.set(lockKey, "1", "PX", 60000, "NX");
              if (lockSet) {
                void (async () => {
                  try {
                    // Fetch fresh rows and write to redis under current version
                    const freshRows = (await dbTry(() =>
                      prisma.menuItem.findMany({
                        take: limit,
                        orderBy: { name: "asc" },
                        select: {
                          id: true,
                          name: true,
                          slug: true,
                          logoUrl: true,
                          createdAt: true,
                        },
                      }),
                    )) as {
                      id: string;
                      name: string;
                      slug: string;
                      logoUrl?: string | null;
                      createdAt: Date;
                    }[];
                    const freshResult = freshRows.map((m) => ({
                      id: m.id,
                      name: m.name,
                      slug: m.slug,
                      logoUrl: m.logoUrl ?? undefined,
                      createdAt: m.createdAt.toISOString(),
                    }));
                    // read version again in case it changed
                    const verRaw2 = await r.get("menu:list:version");
                    const ver2 = verRaw2 ? Number(verRaw2) : 0;
                    const redisKey2 = `menu:list:v:${ver2}:limit:${limit}`;
                    await r.set(
                      redisKey2,
                      JSON.stringify(freshResult),
                      "PX",
                      ttlMs,
                    );
                    // eslint-disable-next-line no-console
                    console.info(
                      "[menuRepo:cache] refresh wrote redis",
                      redisKey2,
                    );
                    // Also update local in-memory cache so subsequent requests on this process benefit
                    menuListCache.value = freshResult;
                    menuListCache.ts = Date.now();
                  } catch (err) {
                    // eslint-disable-next-line no-console
                    console.warn("[menuRepo:cache] redis refresh error", err);
                  } finally {
                    try {
                      await r.del(lockKey);
                    } catch {}
                  }
                })();
              }
            }
          } catch (err) {
            // ignore pttl errors
          }

          return parsed.slice(0, limit);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[menuRepo:cache] redis read error", err);
      }
    }

    // Fetch from DB and update cache
    const rows = await dbTry(() =>
      prisma.menuItem.findMany({
        take: limit,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          createdAt: true,
        },
      }),
    );

    const result = (
      rows as {
        id: string;
        name: string;
        slug: string;
        logoUrl?: string | null;
        createdAt: Date;
      }[]
    ).map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      logoUrl: m.logoUrl ?? undefined,
      createdAt: m.createdAt.toISOString(),
    }));

    menuListCache.value = result;
    menuListCache.ts = Date.now();
    // write to redis if available
    if (r) {
      try {
        const verRaw = await r.get("menu:list:version");
        const ver = verRaw ? Number(verRaw) : 0;
        const redisKey = `menu:list:v:${ver}:limit:${limit}`;
        await r.set(redisKey, JSON.stringify(result), "PX", ttlMs);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[menuRepo:cache] redis write error", err);
      }
    }
    lastCacheStatus = "MISS:db";
    // eslint-disable-next-line no-console
    console.info("[menuRepo:cache] MISS db");
    return result;
  },
  async upsert(data: {
    name: string;
    slug: string;
    logoUrl?: string;
  }): Promise<MenuItemFull> {
    const row = await dbTry(() =>
      prisma.menuItem.upsert({
        where: { slug: data.slug },
        update: { name: data.name, logoUrl: data.logoUrl ?? null },
        create: {
          name: data.name,
          slug: data.slug,
          logoUrl: data.logoUrl ?? null,
        },
      }),
    );
    // Invalidate menu list cache because data changed
    // write-through: bump version and write fresh menu list to redis so reads are immediate
    const r = getRedis();
    if (r) {
      try {
        const newVer = await r.incr("menu:list:version");
        // fetch fresh rows and write the various limit keys (we'll write the default limit key)
        const freshRows = (await dbTry(() =>
          prisma.menuItem.findMany({
            take: 100,
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              slug: true,
              logoUrl: true,
              createdAt: true,
            },
          }),
        )) as {
          id: string;
          name: string;
          slug: string;
          logoUrl?: string | null;
          createdAt: Date;
        }[];
        const freshResult = freshRows.map((m) => ({
          id: m.id,
          name: m.name,
          slug: m.slug,
          logoUrl: m.logoUrl ?? undefined,
          createdAt: m.createdAt.toISOString(),
        }));
        const ttlMs = Number(
          process.env.MENU_CACHE_TTL_MS ?? 3 * 24 * 60 * 60 * 1000,
        );
        const redisKey = `menu:list:v:${newVer}:limit:100`;
        await r.set(redisKey, JSON.stringify(freshResult), "PX", ttlMs);
        // also update in-memory cache for this process
        menuListCache.value = freshResult;
        menuListCache.ts = Date.now();
        // eslint-disable-next-line no-console
        console.info("[menuRepo:cache] write-through wrote", redisKey);
      } catch (err) {
        // fallback to invalidation if write-through fails
        try {
          invalidateMenuListCache();
        } catch {}
        // eslint-disable-next-line no-console
        console.warn("[menuRepo:cache] write-through error", err);
      }
    } else {
      invalidateMenuListCache();
    }
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      logoUrl: row.logoUrl ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  },
};

// Simple module-level in-memory cache (fast path)
const menuListCache: { value: MenuItemDTO[] | null; ts: number } = {
  value: null,
  ts: 0,
};

// Note: use centralized getRedis() from src/lib/redis.ts so all modules respect
// ENABLE_REDIS and REDIS_URL env flags in the same way.

export async function invalidateMenuListCache() {
  // clear in-memory cache
  menuListCache.value = null;
  menuListCache.ts = 0;

  // Use versioned keys in Redis. Increment the version atomically so other
  // instances automatically miss old keys without KEYS scans.
  const r = getRedis();
  if (!r) return;
  try {
    await r.incr("menu:list:version");
    // eslint-disable-next-line no-console
    console.info("[menuRepo:cache] bumped redis menu:list:version");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[menuRepo:cache] redis version bump error", err);
  }
}

// last cache status (best-effort, per-process). Exposed so HTTP handlers can
// report `X-Cache` header. Note: concurrent requests may race this value.
let lastCacheStatus: string | null = null;
export function getMenuLastCacheStatus() {
  return lastCacheStatus;
}

export async function getMenuCacheInfo() {
  const r = getRedis();
  let redisVersion: number | null = null;
  if (r) {
    try {
      const v = await r.get("menu:list:version");
      if (v) redisVersion = Number(v);
    } catch {
      // ignore
    }
  }

  return {
    redisVersion,
    inMemory: {
      ts: menuListCache.ts,
      count: menuListCache.value ? menuListCache.value.length : 0,
    },
    lastCacheStatus,
  };
}
