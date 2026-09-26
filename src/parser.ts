import type { AmVariant } from "./types";

/**
 * 解析 Master M3U8 清单，提取所有音轨变体 (AmVariant)
 * @param m3u8Content Master M3U8 文本内容
 * @param masterUrl Master M3U8 完整绝对路径（用于将相对路径转换为统一路径）
 */
export function parseMasterM3u8(m3u8Content: string, _masterUrl?: string): AmVariant[] {
  const lines = m3u8Content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const variants: AmVariant[] = [];

  // 1. 收集 EXT-X-MEDIA 中的音频流元数据（按 GROUP-ID 索引）
  interface AudioMediaInfo {
    groupId: string;
    channels?: string;
    sampleRate?: number;
    bitDepth?: number;
    name?: string;
  }
  const audioMediaMap = new Map<string, AudioMediaInfo>();

  for (const line of lines) {
    if (line.startsWith("#EXT-X-MEDIA:") && line.includes("TYPE=AUDIO")) {
      const attributes = parseAttributes(line.substring("#EXT-X-MEDIA:".length));
      const groupId = attributes["GROUP-ID"];
      if (groupId) {
        audioMediaMap.set(groupId, {
          groupId,
          channels: attributes["CHANNELS"],
          sampleRate: attributes["SAMPLE-RATE"] ? Number(attributes["SAMPLE-RATE"]) : undefined,
          bitDepth: attributes["BIT-DEPTH"] ? Number(attributes["BIT-DEPTH"]) : undefined,
          name: attributes["NAME"],
        });
      }
    }
  }

  // 2. 收集 EXT-X-STREAM-INF 及其下一行的 URI
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const attributes = parseAttributes(line.substring("#EXT-X-STREAM-INF:".length));
      const nextLine = lines[i + 1];
      if (nextLine && !nextLine.startsWith("#")) {
        const uri = nextLine;
        const groupId = attributes["AUDIO"] || "";
        const mediaInfo = audioMediaMap.get(groupId);

        const codecs = attributes["CODECS"] || "";
        const bandwidth = Number(attributes["BANDWIDTH"] || attributes["AVERAGE-BANDWIDTH"] || 0);

        variants.push({
          audio: groupId,
          group_id: groupId,
          codecs,
          uri,
          file_uri: uri,
          bandwidth,
          channels: mediaInfo?.channels ?? null,
          sample_rate: mediaInfo?.sampleRate ?? null,
          bit_depth: mediaInfo?.bitDepth ?? null,
        });
      }
    }
  }

  return variants;
}

/**
 * 辅助解析 M3U8 标签属性键值对（处理带双引号及无引号属性）
 */
export function parseAttributes(attrStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /([A-Z0-9_-]+)=(?:"([^"]*)"|([^,]+))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(attrStr)) !== null) {
    const key = match[1];
    const value = match[2] !== undefined ? match[2] : match[3];
    result[key] = value.trim();
  }
  return result;
}
