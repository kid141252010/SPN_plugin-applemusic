import type {
  AmParseResponse,
  AmVariant,
  MusicUrlReq,
  MusicUrlRes,
  PluginQuality,
  PluginSettingItem,
  WmM3u8Response,
} from "./types";
import { extractAdamId, getStorefront } from "./extractor";
import { pickBestVariant } from "./matcher";
import { parseMasterM3u8 } from "./parser";
import { parsePluginUpstream } from "./upstream";
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
    label: "上游服务地址",
    description:
      "提供音源解析与解密流代理的服务端点（支持 am-hook 与 wrapper-manager，末尾不带斜杠）",
    placeholder: "https://music.ak1ra.de5.net",
    default: "https://music.ak1ra.de5.net",
  },
  {
    key: "upstreamToken",
    type: "text",
    label: "上游鉴权 Token (可选)",
    description:
      "若上游服务开启了鉴权保护（如 wrapper-manager-relay），请在此填写 Bearer Token / 访问密钥",
    placeholder: "例如: eyJhbGciOi...",
    default: "",
  },
  {
    key: "requestTimeout",
    type: "number",
    label: "解析超时时间 (毫秒)",
    description: "向服务上游发起解析请求的超时时间，建议 3000~6000ms 之间以避免切歌假死",
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

  // 3. 读取配置项并解析上游地址与凭证
  const preferDolbyAtmos = Boolean(splayer.getSetting<boolean>("preferDolbyAtmos") ?? false);
  const rawUpstream = splayer.getSetting<string>("upstreamUrl") || DEFAULT_UPSTREAM;
  const rawToken = splayer.getSetting<string>("upstreamToken") || "";
  const { upstream, token, authHeaders } = parsePluginUpstream(rawUpstream, rawToken);
  const timeoutMs = Number(splayer.getSetting<number>("requestTimeout")) || DEFAULT_TIMEOUT_MS;

  try {
    let masterUrl = "";
    let variants: AmVariant[] = [];
    let isHookProxy = false;

    // 先尝试 am-hook 复合解析接口
    const amHookEndpoint = `${upstream}/parse/${adamId}?storefront=${encodeURIComponent(storefront)}`;
    try {
      const res = await splayer.request(amHookEndpoint, {
        method: "GET",
        timeout: timeoutMs,
        headers: {
          Accept: "application/json",
          "User-Agent": "SPlayer-Next/1412.applemusic",
          ...authHeaders,
        },
      });

      const status = res.status ?? res.statusCode;
      if (status === 200) {
        const data: AmParseResponse =
          typeof res.body === "string"
            ? JSON.parse(res.body)
            : JSON.parse(new TextDecoder().decode(res.body));
        if (data.masterUrl && Array.isArray(data.variants) && data.variants.length > 0) {
          masterUrl = data.masterUrl;
          variants = data.variants;
          isHookProxy = Boolean(data.hook);
        }
      }
    } catch {
      // 若 am-hook 接口不可用，自动降级尝试 wrapper-manager (/m3u8) 接口
    }

    // 若未通过 am-hook 获取到变体，尝试 wrapper-manager 接口
    if (variants.length === 0) {
      const wmM3u8Endpoint = `${upstream}/m3u8?adamId=${encodeURIComponent(adamId)}&storefront=${encodeURIComponent(storefront)}`;
      const res = await splayer.request(wmM3u8Endpoint, {
        method: "GET",
        timeout: timeoutMs,
        headers: {
          Accept: "application/json",
          "User-Agent": "SPlayer-Next/1412.applemusic",
          ...authHeaders,
        },
      });

      const status = res.status ?? res.statusCode;
      if (status !== 200) {
        throw new Error(`上游服务器响应 HTTP ${status}`);
      }

      const wmRes: WmM3u8Response =
        typeof res.body === "string"
          ? JSON.parse(res.body)
          : JSON.parse(new TextDecoder().decode(res.body));

      if (!wmRes.data?.m3u8) {
        throw new Error(wmRes.msg || `未能解析到 [${storefront}] 地区该曲目的 Master M3U8 清单`);
      }

      masterUrl = wmRes.data.m3u8;

      // 拉取并解析 Apple CDN Master M3U8
      const masterContentRes = await splayer.request(masterUrl, {
        method: "GET",
        timeout: timeoutMs,
        headers: {
          "User-Agent": "iTunes/12.11.3 (Windows; Microsoft Windows 10.0.19045)",
        },
      });

      const masterContent =
        typeof masterContentRes.body === "string"
          ? masterContentRes.body
          : new TextDecoder().decode(masterContentRes.body);

      variants = parseMasterM3u8(masterContent, masterUrl);
    }

    if (!masterUrl || variants.length === 0) {
      throw new Error(`未能解析到 [${storefront}] 地区该曲目的可用音轨变体`);
    }

    // 4. 匹配音质变体（包含杜比全景声优先判定）
    const matched = pickBestVariant(variants, quality, preferDolbyAtmos);
    if (!matched) {
      throw new Error(`未能找到符合要求 (${quality}) 的可播放音频变体`);
    }

    const baseUrl = masterUrl.slice(0, masterUrl.lastIndexOf("/") + 1);
    let streamUrl: string;

    // 5. 优先采用 SPlayer-Next 客户端本地 WASM 流媒体代理直连 Apple CDN 极速播放
    if (splayer.appleMusic?.getStreamUrl && matched.variant.uri) {
      const m3u8Url =
        matched.variant.uri.startsWith("http://") || matched.variant.uri.startsWith("https://")
          ? matched.variant.uri
          : `${baseUrl}${matched.variant.uri}`;
      streamUrl = await splayer.appleMusic.getStreamUrl(adamId, m3u8Url, upstream, token);
      splayer.log.info(`[am-hook] 启用本地 WASM 极速直连解密流: ${streamUrl}`);
    } else {
      if (!isHookProxy || !matched.variant.file_uri) {
        throw new Error("上游实例未开启服务端解密流代理，且宿主未就绪本地解密");
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
