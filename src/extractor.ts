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
