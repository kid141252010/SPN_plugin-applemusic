import type { MusicInfo } from "./types";

/**
 * 从宿主传入的元数据提取 Apple Music 纯数字 Adam ID
 * @param musicInfo 宿主传入的歌曲元数据
 * @returns 提取到的纯数字 ID 字符串，无法提取返回 null
 */
export function extractAdamId(musicInfo: MusicInfo): string | null {
  if (!musicInfo) return null;

  // 宿主规范中 id / songmid / songId 均为平台歌曲 ID
  const candidates: Array<unknown> = [
    musicInfo.id,
    musicInfo.songmid,
    musicInfo.songId,
    musicInfo.meta?.songId,
  ];

  for (const raw of candidates) {
    if (raw === undefined || raw === null) continue;
    const str = String(raw).trim();
    if (!str) continue;

    // 纯数字 Adam ID（如 1468058171）
    if (/^\d{5,12}$/.test(str)) {
      return str;
    }

    // 若带有平台前缀（如 am_1468058171）
    const prefixMatch = str.match(/(?:am|apple)[_:\-\/](\d{5,12})/i);
    if (prefixMatch) {
      return prefixMatch[1];
    }

    // 若传入的是 Web 链接，提取末尾 ID
    const urlMatch = str.match(/(?:\/song\/(?:[^\/]+\/)?|\?i=)(\d{5,12})/i);
    if (urlMatch) {
      return urlMatch[1];
    }
  }

  return null;
}

/**
 * 获取宿主透传的 Apple Music 商店地区代码 (storefront)
 * @param musicInfo 宿主传入的元数据
 * @returns 规范化的两位小写地区码（如 cn, us, jp），未传时回退到 "cn"
 */
export function getStorefront(musicInfo: MusicInfo): string {
  const raw = musicInfo?.storefront || musicInfo?.meta?.storefront;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim().toLowerCase();
  }
  return "cn";
}
