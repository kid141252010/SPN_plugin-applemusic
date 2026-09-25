/**
 * 负缓存 (Negative Caching) 模块
 * 记录短期内已知解析失败或失效的曲目 Adam ID，防止频繁切歌造成雪崩
 */

interface CacheItem {
  timestamp: number;
  reason: string;
}

const negativeCache = new Map<string, CacheItem>();

/** 默认负缓存有效时间：10 分钟 */
const DEFAULT_NEGATIVE_TTL_MS = 10 * 60 * 1000;

/** 最大缓存记录条数 */
const MAX_CACHE_ENTRIES = 500;

/**
 * 检查指定 Adam ID 与 Storefront 是否处于负缓存期
 * @param adamId Apple Music Adam ID
 * @param storefront 地区代码 (如 cn, us)
 * @param ttlMs 缓存有效期（毫秒）
 * @returns 若命中负缓存返回失败原因，否则返回 null
 */
export function checkNegativeCache(
  adamId: string,
  storefront = "",
  ttlMs = DEFAULT_NEGATIVE_TTL_MS,
): string | null {
  const key = storefront ? `${adamId}:${storefront}` : adamId;
  const item = negativeCache.get(key);
  if (!item) return null;

  if (Date.now() - item.timestamp > ttlMs) {
    negativeCache.delete(key);
    return null;
  }

  return item.reason;
}

/**
 * 记录解析失败到负缓存
 * @param adamId Apple Music Adam ID
 * @param storefront 地区代码
 * @param reason 失败原因描述
 */
export function recordNegativeCache(
  adamId: string,
  storefront: string,
  reason: string,
): void {
  const key = storefront ? `${adamId}:${storefront}` : adamId;
  if (negativeCache.size >= MAX_CACHE_ENTRIES) {
    // 简单淘汰最旧的一条记录
    const oldestKey = negativeCache.keys().next().value;
    if (oldestKey) negativeCache.delete(oldestKey);
  }

  negativeCache.set(key, {
    timestamp: Date.now(),
    reason,
  });
}

/**
 * 清空负缓存（用于调试或重试）
 */
export function clearNegativeCache(): void {
  negativeCache.clear();
}
