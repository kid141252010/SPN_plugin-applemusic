import type { ConfiguredMode, DetectedMode } from "./types";

/** 内存中的上游架构模式缓存 */
const modeMemoryCache = new Map<string, DetectedMode>();

/** 规范化 upstream key */
function normalizeUpstreamKey(upstream: string): string {
  return (upstream || "").trim().replace(/\/+$/, "");
}

/**
 * 获取当前上游实际应使用的架构模式
 *
 * 决策优先级：
 * 1. 用户显式设置 ("am-hook" | "wm") -> 直接采用用户设定
 * 2. 内存自适应缓存 (已探测到的架构) -> 直接返回
 * 3. 宿主持久化存储 (splayer.storage) -> 读取并恢复至内存
 * 4. 首次访问未探测 (undefined) -> 走自动探测流程
 *
 * @param upstream 标准化后的上游服务器地址
 * @param configuredMode 用户在插件设置中指定的模式 (默认 "auto")
 */
export async function getEffectiveUpstreamMode(
  upstream: string,
  configuredMode: ConfiguredMode = "auto",
): Promise<DetectedMode | undefined> {
  const key = normalizeUpstreamKey(upstream);
  if (!key) return undefined;

  // 1. 若用户在设置中显式指定了具体模式，强制优先使用
  if (configuredMode === "am-hook" || configuredMode === "wm") {
    return configuredMode;
  }

  // 2. 检查内存自适应缓存
  if (modeMemoryCache.has(key)) {
    return modeMemoryCache.get(key);
  }

  // 3. 尝试从宿主持久化存储 (splayer.storage) 中恢复
  if (typeof splayer !== "undefined" && splayer.storage?.get) {
    try {
      const stored = await splayer.storage.get<DetectedMode>(`upstream_mode:${key}`);
      if (stored === "am-hook" || stored === "wm") {
        modeMemoryCache.set(key, stored);
        return stored;
      }
    } catch {
      // 容错忽略 storage 异常
    }
  }

  return undefined;
}

/**
 * 记录探测到的上游架构模式到内存及持久化存储
 *
 * @param upstream 上游服务器地址
 * @param mode 探测到的架构模式 ("am-hook" | "wm")
 */
export function recordUpstreamMode(upstream: string, mode: DetectedMode): void {
  const key = normalizeUpstreamKey(upstream);
  if (!key) return;

  modeMemoryCache.set(key, mode);

  if (typeof splayer !== "undefined" && splayer.storage?.set) {
    splayer.storage.set(`upstream_mode:${key}`, mode).catch(() => {
      // 容错忽略存储写入失败
    });
  }
}

/**
 * 同步读取内存中已缓存的上游架构模式
 */
export function getCachedUpstreamModeSync(upstream: string): DetectedMode | undefined {
  const key = normalizeUpstreamKey(upstream);
  return modeMemoryCache.get(key);
}

/**
 * 清除上游架构缓存（支持指定单个 upstream 或全部清空）
 */
export function clearUpstreamMode(upstream?: string): void {
  if (upstream) {
    const key = normalizeUpstreamKey(upstream);
    modeMemoryCache.delete(key);
    if (typeof splayer !== "undefined" && splayer.storage?.remove) {
      splayer.storage.remove(`upstream_mode:${key}`).catch(() => {});
    }
  } else {
    modeMemoryCache.clear();
  }
}
