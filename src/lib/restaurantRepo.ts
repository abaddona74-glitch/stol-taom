import { dbTry } from "./dbTry";
import { prisma } from "./prisma";
import { getRedis } from "./redis";
import { setLastSync } from "./redis";
import { logger } from "./logger";

export type RestaurantDTO = {
  id: string;
  name: string;
  logoUrl?: string;
  createdAt: number;
};

/**
 * In-memory cache for restaurants list
 */
let restaurantsCache = { value: null as RestaurantDTO[] | null, ts: 0 };

/**
 * Track last known cache status for HTTP header reporting
 */
let lastCacheStatus = "MISS";

export const restaurantRepo = {
  async list(): Promise<RestaurantDTO[]> {
    const ttlMs = Number(
      process.env.MENU_CACHE_TTL_MS ?? 3 * 24 * 60 * 60 * 1000,
    );

    // Check memory cache first
    if (restaurantsCache.value && Date.now() - restaurantsCache.ts < ttlMs) {
      lastCacheStatus = "HIT memory";
      logger.info("[restaurantRepo:cache] HIT memory");
      return restaurantsCache.value;
    }

    // Check Redis
    const r = getRedis();
    if (r) {
      try {
        const ver = await r.get("menu:restaurants:version");
        const version = ver ? parseInt(ver, 10) : 0;
        const redisKey = `menu:restaurants:v:${version}`;
        const cached = await r.get(redisKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          lastCacheStatus = "HIT redis";
          logger.info("[restaurantRepo:cache] HIT redis", { key: redisKey });
          // Update memory cache
          restaurantsCache.value = parsed;
          restaurantsCache.ts = Date.now();
          return parsed;
        }
      } catch (err) {
        logger.warn("[restaurantRepo:cache] Redis error", err);
      }
    }

    // Query database
    lastCacheStatus = "MISS";
    logger.info("[restaurantRepo:cache] MISS - querying database");
    const rows = await dbTry(() =>
      prisma.restaurant.findMany({ orderBy: { name: "asc" } }),
    );
    const result = (
      rows as {
        id: string;
        name: string;
        logoUrl?: string | null;
        createdAt: Date;
      }[]
    ).map((r) => ({
      id: r.id,
      name: r.name,
      logoUrl: r.logoUrl ?? undefined,
      createdAt: r.createdAt.getTime(),
    }));

    // Cache in memory
    restaurantsCache.value = result;
    restaurantsCache.ts = Date.now();

    // Cache in Redis
    if (r) {
      try {
        const ver = await r.get("menu:restaurants:version");
        const version = ver ? parseInt(ver, 10) : 0;
        const redisKey = `menu:restaurants:v:${version}`;
        await r.set(redisKey, JSON.stringify(result), "PX", ttlMs);
        logger.info("[restaurantRepo:cache] cached to redis", {
          key: redisKey,
        });
        try {
          await setLastSync();
        } catch (err) {
          logger.warn("[restaurantRepo:cache] setLastSync failed", err);
        }
      } catch (err) {
        logger.warn("[restaurantRepo:cache] Redis set error", err);
      }
    }

    return result;
  },

  async upsert(data: {
    name: string;
    logoUrl?: string;
  }): Promise<RestaurantDTO> {
    const slugName = data.name.trim();
    const row = await dbTry(() =>
      prisma.restaurant.upsert({
        where: { name: slugName },
        update: { logoUrl: data.logoUrl ?? null },
        create: { name: slugName, logoUrl: data.logoUrl ?? null },
      }),
    );

    // Write-through: update redis so reads see the change immediately.
    const r = getRedis();
    if (r) {
      try {
        // bump version and write full restaurants list under the new version
        const newVer = await r.incr("menu:restaurants:version");
        const rows = await dbTry(() =>
          prisma.restaurant.findMany({ orderBy: { name: "asc" } }),
        );
        const payload = (
          rows as {
            id: string;
            name: string;
            logoUrl?: string | null;
            createdAt: Date;
          }[]
        ).map((r) => ({
          id: r.id,
          name: r.name,
          logoUrl: r.logoUrl ?? undefined,
          createdAt: r.createdAt.getTime(),
        }));
        const redisKey = `menu:restaurants:v:${newVer}`;
        const ttlMs = Number(
          process.env.MENU_CACHE_TTL_MS ?? 3 * 24 * 60 * 60 * 1000,
        );
        await r.set(redisKey, JSON.stringify(payload), "PX", ttlMs);
        logger.info("[restaurantRepo:cache] write-through wrote", {
          key: redisKey,
        });
        try {
          await setLastSync();
        } catch (err) {
          logger.warn("[restaurantRepo:cache] setLastSync failed", err);
        }
      } catch (err) {
        logger.warn("[restaurantRepo:cache] write-through error", err);
      }
    }
    return {
      id: row.id,
      name: row.name,
      logoUrl: row.logoUrl ?? undefined,
      createdAt: row.createdAt.getTime(),
    };
  },
};

// Invalidate in-process memory cache so subsequent reads will fall through
// to Redis / DB and reflect new data.
export function clearRestaurantsCache() {
  restaurantsCache.value = null;
  restaurantsCache.ts = 0;
  lastCacheStatus = "MISS";
}

export function getRestaurantLastCacheStatus(): string | null {
  return lastCacheStatus ?? null;
}
