import type { MusicInfo } from "./types";

/**
 * 从不同形式的输入提取纯数字 Apple Music Adam ID
 * @param musicInfo 宿主传入的歌曲元数据
 * @returns 提取到的纯数字 ID 字符串，无法提取返回 null
 */
export function extractAdamId(musicInfo: MusicInfo): string | null {
  if (!musicInfo) return null;

  // 候选值按优先级：meta.songId > songId > id > songmid
  const candidates: Array<unknown> = [
    musicInfo.meta?.songId,
    musicInfo.songId,
    musicInfo.id,
    musicInfo.songmid,
  ];

  for (const raw of candidates) {
    if (raw === undefined || raw === null) continue;
    const str = String(raw).trim();
    if (!str) continue;

    // 1. 若已经是纯数字（Apple Music Adam ID 通常为 5~12 位数字）
    if (/^\d{5,12}$/.test(str)) {
      return str;
    }

    // 2. 若带有前缀（如 am_1468058171 或 apple:1468058171）
    const prefixMatch = str.match(/(?:am|apple)[_:\-\/](\d{5,12})/i);
    if (prefixMatch) {
      return prefixMatch[1];
    }

    // 3. 若传入的是 Apple Music Web 链接
    if (str.includes("music.apple.com")) {
      // 检查 ?i=1468058171 参数（单曲在专辑页面中的 track ID）
      const trackParamMatch = str.match(/[?&]i=(\d{5,12})/);
      if (trackParamMatch) {
        return trackParamMatch[1];
      }

      // 检查 /song/slug/1468058171 或 /song/1468058171
      const songPathMatch = str.match(/\/song\/(?:[^\/]+\/)?(\d{5,12})/i);
      if (songPathMatch) {
        return songPathMatch[1];
      }

      // 检查 /album/slug/1468058171
      const albumPathMatch = str.match(/\/album\/(?:[^\/]+\/)?(\d{5,12})/i);
      if (albumPathMatch) {
        return albumPathMatch[1];
      }
    }

    // 4. 兜底提取字符串中任意独立的 6 位以上连续数字
    const generalMatch = str.match(/\b(\d{6,12})\b/);
    if (generalMatch) {
      return generalMatch[1];
    }
  }

  return null;
}

/**
 * 解析当前曲目对应的 Apple Music Storefront (地区代码，如 cn, us, jp)
 * 优先从宿主本体传入的 musicInfo 中获取，支持各种驼峰与层级命名
 * @param musicInfo 宿主传入的元数据
 * @param fallback 兜底默认值
 * @returns 规范化的 2 位小写国家/地区码
 */
export function resolveStorefront(musicInfo: MusicInfo, fallback = "cn"): string {
  if (!musicInfo) return fallback.toLowerCase();

  const info = musicInfo as Record<string, unknown>;
  const meta = (musicInfo.meta || {}) as Record<string, unknown>;

  // 1. 本体显式传递：按各种常见命名取值（storefront, storeFront, region, country 等）
  const candidates: unknown[] = [
    info.storefront,
    info.storeFront,
    info.Storefront,
    info.StoreFront,
    info.region,
    info.country,
    meta.storefront,
    meta.storeFront,
    meta.Storefront,
    meta.StoreFront,
    meta.region,
    meta.country,
  ];

  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    const str = raw.trim().toLowerCase();
    if (!str) continue;

    // 纯两位字母代码（如 "cn", "us", "jp"）
    if (/^[a-z]{2}$/.test(str)) {
      return str;
    }

    // 格式如 "zh-cn", "en-us" -> 提取最后两位地区代码
    const localeMatch = str.match(/[-_]([a-z]{2})$/);
    if (localeMatch) {
      return localeMatch[1];
    }
  }

  // 2. 从链接中提取（例如用户导入了带 /us/ 或 /jp/ 路径的 Apple Music URL）
  const urlCandidates = [musicInfo.songmid, musicInfo.id, musicInfo.songId];
  for (const item of urlCandidates) {
    if (typeof item === "string" && item.includes("music.apple.com")) {
      const urlMatch = item.match(/music\.apple\.com\/([a-zA-Z]{2})\//);
      if (urlMatch) {
        return urlMatch[1].toLowerCase();
      }
    }
  }

  return fallback.toLowerCase();
}

