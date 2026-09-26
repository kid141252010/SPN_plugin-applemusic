import type {
  AmParseResponse,
  MusicUrlReq,
  MusicUrlRes,
  PluginQuality,
  PluginSettingItem,
} from "./types";
import { extractAdamId, getStorefront } from "./extractor";
import { pickBestVariant } from "./matcher";
import { checkNegativeCache, recordNegativeCache } from "./cache";

/** 默认上游解析服务器地址 */
const DEFAULT_UPSTREAM = "https://music.ak1ra.de5.net";

/** 默认超时时间（毫秒） */
const DEFAULT_TIMEOUT_MS = 4500;

/** 插件配置项声明 */
const SETTINGS: PluginSettingItem[] = [
  {
    key: "preferDolbyAtmos",
    type: "switch",
    label: "优先杜比全景声 (Dolby Atmos)",
    description:
      "若曲目提供杜比全景声 / 空间音频 (ec-3 编码) 音轨，无论请求何种音质均优先返回该音轨（需播放设备及系统支持多声道输出）",
    default: false,
  },
  {
    key: "upstreamUrl",
    type: "text",
    label: "am-hook 上游服务地址",
    description:
      "提供音源解析与解密流代理的 am-hook 服务端点，支持配置自建节点（末尾不带斜杠）",
    placeholder: "https://music.ak1ra.de5.net",
    default: "https://music.ak1ra.de5.net",
  },
  {
    key: "requestTimeout",
    type: "number",
    label: "解析超时时间 (毫秒)",
    description: "向 am-hook 上游发起解析请求的超时时间，建议 3000~6000ms 之间以避免切歌假死",
    default: 4500,
    min: 1000,
    max: 15000,
  },
];

/**
 * 注册 SPlayer-Next 音源与设置
 * 音质档位与 SPlayer-Next 官方规范 (QualityLevel) 严格对齐:
 * ["hi-res", "lossless", "hq", "sq", "lq"]
 */
splayer.register({
  sources: {
    am: {
      name: "Apple Music",
      actions: ["musicUrl"],
      qualities: ["hi-res", "lossless", "hq", "sq", "lq"],
    },
  },
  settings: SETTINGS,
});

/**
 * 处理音频播放流解析
 */
splayer.on("musicUrl", async (req: MusicUrlReq): Promise<MusicUrlRes> => {
  const { source, quality, musicInfo } = req;

  if (source !== "am") {
    throw new Error(`[am-hook] 不支持的源类型: ${source}`);
  }

  // 1. 提取 Adam ID 与宿主透传的 Storefront 地区代码
  const adamId = extractAdamId(musicInfo);
  if (!adamId) {
    const rawHint = musicInfo.id || musicInfo.songmid || musicInfo.name || "未知";
    throw new Error(`[am-hook] 无法从曲目信息中提取有效的 Apple Music Adam ID (${rawHint})`);
  }

  const storefront = getStorefront(musicInfo);

  // 2. 检查负缓存（按 adamId:storefront 隔离）
  const cachedError = checkNegativeCache(adamId, storefront);
  if (cachedError) {
    throw new Error(`[am-hook] 曲目在 [${storefront}] 地区短期内解析失败，已跳过: ${cachedError}`);
  }

  // 3. 读取配置项
  const preferDolbyAtmos = Boolean(splayer.getSetting<boolean>("preferDolbyAtmos") ?? false);
  const rawUpstream = splayer.getSetting<string>("upstreamUrl") || DEFAULT_UPSTREAM;
  const upstream = rawUpstream.trim().replace(/\/+$/, "");
  const timeoutMs = Number(splayer.getSetting<number>("requestTimeout")) || DEFAULT_TIMEOUT_MS;

  // 请求 am-hook，透传 storefront
  const parseEndpoint = `${upstream}/parse/${adamId}?storefront=${encodeURIComponent(storefront)}`;

  try {
    const res = await splayer.request(parseEndpoint, {
      method: "GET",
      timeout: timeoutMs,
      headers: {
        Accept: "application/json",
        "User-Agent": "SPlayer-Next/1412.applemusic",
      },
    });

    const status = res.status ?? res.statusCode;
    if (status !== 200) {
      throw new Error(`上游服务器响应 HTTP ${status}`);
    }

    const data: AmParseResponse =
      typeof res.body === "string"
        ? JSON.parse(res.body)
        : JSON.parse(new TextDecoder().decode(res.body));

    if (!data.masterUrl || !Array.isArray(data.variants) || data.variants.length === 0) {
      throw new Error(data.msg || `未能解析到 [${storefront}] 地区该曲目的可用音轨变体`);
    }

    // 4. 匹配音质变体（包含杜比全景声优先判定）
    const matched = pickBestVariant(data.variants, quality, preferDolbyAtmos);
    if (!matched) {
      throw new Error(`未能找到符合要求 (${quality}) 的可播放音频变体`);
    }

    const baseUrl = data.masterUrl.slice(0, data.masterUrl.lastIndexOf("/") + 1);
    let streamUrl: string;

    // 5. 优先采用 SPlayer-Next 客户端本地 WASM 流媒体代理直连 Apple CDN 极速播放
    if (splayer.appleMusic?.getStreamUrl && matched.variant.uri) {
      const m3u8Url = `${baseUrl}${matched.variant.uri}`;
      streamUrl = await splayer.appleMusic.getStreamUrl(adamId, m3u8Url, upstream);
      splayer.log.info(`[am-hook] 启用本地 WASM 极速直连解密流: ${streamUrl}`);
    } else {
      if (!data.hook || !matched.variant.file_uri) {
        throw new Error("上游 am-hook 实例未开启 --hook 服务端解密流代理，且宿主未就绪本地解密");
      }
      streamUrl = `${upstream}/${baseUrl}${matched.variant.file_uri}`;
      splayer.log.info(`[am-hook] 降级至服务端中转解密流: ${streamUrl}`);
    }

    splayer.log.info(
      `[am-hook] 成功解析 [${storefront}] Adam ID ${adamId} -> 编码: ${matched.variant.codecs}, 质量: ${matched.quality}` +
        (preferDolbyAtmos && matched.variant.codecs.includes("ec-3") ? " (杜比全景声)" : ""),
    );

    return {
      url: streamUrl,
      quality: matched.quality,
    };
  } catch (err: unknown) {
    const message = (err as Error).message || String(err);
    recordNegativeCache(adamId, storefront, message);
    splayer.log.warn(`[am-hook] [${storefront}] 解析失败 (${adamId}): ${message}`);
    throw new Error(`[am-hook] 音源解析失败: ${message}`);
  }
});
