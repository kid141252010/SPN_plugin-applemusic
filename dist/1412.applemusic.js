/**
 * @name Apple Music 音源
 * @id 1412.applemusic
 * @version 1.2.0
 * @description 基于 am-hook 与 wrapper-manager 上游服务为 SPlayer-Next 提供 Apple Music 音频流解析支持（支持 Hi-Res、Lossless 无损及杜比全景声）
 * @author 1412
 * @type source
 * @apiLevel 2
 * @updateUrl https://raw.githubusercontent.com/kid141252010/applemusic/main/dist/1412.applemusic.js
 * @changelog 支持上游服务 Token 鉴权与 URL 内嵌凭证自动提取\n增加 wrapper-manager 原生协议兼容与 Master M3U8 音轨变体解析
 */

"use strict";
(() => {
  // src/extractor.ts
  function extractAdamId(musicInfo) {
    if (!musicInfo) return null;
    const candidates = [
      musicInfo.id,
      musicInfo.songmid,
      musicInfo.songId,
      musicInfo.meta?.songId
    ];
    for (const raw of candidates) {
      if (raw === void 0 || raw === null) continue;
      const str = String(raw).trim();
      if (!str) continue;
      if (/^\d{5,12}$/.test(str)) {
        return str;
      }
      const prefixMatch = str.match(/(?:am|apple)[_:\-\/](\d{5,12})/i);
      if (prefixMatch) {
        return prefixMatch[1];
      }
      const urlMatch = str.match(/(?:\/song\/(?:[^\/]+\/)?|\?i=)(\d{5,12})/i);
      if (urlMatch) {
        return urlMatch[1];
      }
    }
    return null;
  }
  function getStorefront(musicInfo) {
    const raw = musicInfo?.storefront || musicInfo?.meta?.storefront;
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim().toLowerCase();
    }
    return "cn";
  }

  // src/matcher.ts
  function isDolbyAtmos(v) {
    const codecs = (v.codecs || "").toLowerCase();
    const channels = (v.channels || "").toLowerCase();
    const groupId = (v.group_id || "").toLowerCase();
    return codecs === "ec-3" || codecs === "ec3" || channels.includes("joc") || groupId.includes("atmos");
  }
  function isAlac(v) {
    return (v.codecs || "").toLowerCase() === "alac";
  }
  function isHiResAlac(v) {
    if (!isAlac(v)) return false;
    const sampleRate = v.sample_rate || 0;
    const bitDepth = v.bit_depth || 0;
    return sampleRate >= 88200 && bitDepth >= 24;
  }
  function isStandardAac(v) {
    return (v.codecs || "").toLowerCase().startsWith("mp4a.40.2");
  }
  function isHeAac(v) {
    return (v.codecs || "").toLowerCase().startsWith("mp4a.40.5");
  }
  function channelPreferenceScore(v) {
    const channels = (v.channels || "").toUpperCase();
    const groupId = (v.group_id || "").toUpperCase();
    if (channels.includes("BINAURAL") || groupId.includes("BINAURAL")) return -1;
    if (channels.includes("DOWNMIX") || groupId.includes("DOWNMIX")) return -1;
    return 1;
  }
  function pickBestVariant(variants, targetQuality, preferDolbyAtmos = false) {
    if (!Array.isArray(variants) || variants.length === 0) {
      return null;
    }
    if (preferDolbyAtmos) {
      const atmosVariants = variants.filter(isDolbyAtmos).sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
      if (atmosVariants.length > 0) {
        return {
          variant: atmosVariants[0],
          quality: "hi-res"
        };
      }
    }
    const alacVariants = variants.filter(isAlac).sort((a, b) => {
      const srDiff = (b.sample_rate || 0) - (a.sample_rate || 0);
      if (srDiff !== 0) return srDiff;
      const bdDiff = (b.bit_depth || 0) - (a.bit_depth || 0);
      if (bdDiff !== 0) return bdDiff;
      return (b.bandwidth || 0) - (a.bandwidth || 0);
    });
    const standardAacVariants = variants.filter(isStandardAac).sort((a, b) => {
      const prefDiff = channelPreferenceScore(b) - channelPreferenceScore(a);
      if (prefDiff !== 0) return prefDiff;
      return (b.bandwidth || 0) - (a.bandwidth || 0);
    });
    const heAacVariants = variants.filter(isHeAac).sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
    if (targetQuality === "hi-res") {
      const hiRes = alacVariants.find(isHiResAlac);
      if (hiRes) return { variant: hiRes, quality: "hi-res" };
      if (alacVariants.length > 0) {
        return { variant: alacVariants[0], quality: "lossless" };
      }
      if (standardAacVariants.length > 0) {
        return { variant: standardAacVariants[0], quality: "hq" };
      }
    }
    if (targetQuality === "lossless") {
      const standardLossless = alacVariants.find((v) => (v.sample_rate || 0) <= 48e3) || alacVariants[0];
      if (standardLossless) {
        return {
          variant: standardLossless,
          quality: isHiResAlac(standardLossless) ? "hi-res" : "lossless"
        };
      }
      if (standardAacVariants.length > 0) {
        return { variant: standardAacVariants[0], quality: "hq" };
      }
    }
    if (targetQuality === "hq") {
      const aac256 = standardAacVariants.find((v) => (v.bandwidth || 0) > 2e5);
      if (aac256) return { variant: aac256, quality: "hq" };
      if (standardAacVariants.length > 0) {
        return { variant: standardAacVariants[0], quality: "hq" };
      }
      if (alacVariants.length > 0) {
        return { variant: alacVariants[0], quality: "lossless" };
      }
    }
    if (targetQuality === "sq") {
      const aac128 = standardAacVariants.find((v) => (v.bandwidth || 0) <= 2e5);
      if (aac128) return { variant: aac128, quality: "sq" };
      if (standardAacVariants.length > 0) {
        return {
          variant: standardAacVariants[standardAacVariants.length - 1],
          quality: "sq"
        };
      }
      if (heAacVariants.length > 0) {
        return { variant: heAacVariants[0], quality: "lq" };
      }
    }
    if (targetQuality === "lq") {
      if (heAacVariants.length > 0) {
        return { variant: heAacVariants[0], quality: "lq" };
      }
      if (standardAacVariants.length > 0) {
        const lowestAac = standardAacVariants[standardAacVariants.length - 1];
        return { variant: lowestAac, quality: "lq" };
      }
    }
    const fallback = alacVariants[0] || standardAacVariants[0] || heAacVariants[0] || variants[0];
    let fallbackQuality = "hq";
    if (isHiResAlac(fallback)) fallbackQuality = "hi-res";
    else if (isAlac(fallback)) fallbackQuality = "lossless";
    else if (isHeAac(fallback)) fallbackQuality = "lq";
    return {
      variant: fallback,
      quality: fallbackQuality
    };
  }

  // src/parser.ts
  function parseMasterM3u8(m3u8Content, _masterUrl) {
    const lines = m3u8Content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const variants = [];
    const audioMediaMap = /* @__PURE__ */ new Map();
    for (const line of lines) {
      if (line.startsWith("#EXT-X-MEDIA:") && line.includes("TYPE=AUDIO")) {
        const attributes = parseAttributes(line.substring("#EXT-X-MEDIA:".length));
        const groupId = attributes["GROUP-ID"];
        if (groupId) {
          audioMediaMap.set(groupId, {
            groupId,
            channels: attributes["CHANNELS"],
            sampleRate: attributes["SAMPLE-RATE"] ? Number(attributes["SAMPLE-RATE"]) : void 0,
            bitDepth: attributes["BIT-DEPTH"] ? Number(attributes["BIT-DEPTH"]) : void 0,
            name: attributes["NAME"]
          });
        }
      }
    }
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
            bit_depth: mediaInfo?.bitDepth ?? null
          });
        }
      }
    }
    return variants;
  }
  function parseAttributes(attrStr) {
    const result = {};
    const regex = /([A-Z0-9_-]+)=(?:"([^"]*)"|([^,]+))/g;
    let match;
    while ((match = regex.exec(attrStr)) !== null) {
      const key = match[1];
      const value = match[2] !== void 0 ? match[2] : match[3];
      result[key] = value.trim();
    }
    return result;
  }

  // src/upstream.ts
  function parsePluginUpstream(rawUpstream, rawToken) {
    let urlStr = (rawUpstream || "").trim();
    let token = (rawToken || "").trim() || void 0;
    try {
      const u = new URL(urlStr);
      if (u.username) {
        if (u.password) {
          const creds = `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`;
          const authHeaders2 = {
            Authorization: `Basic ${btoa(creds)}`
          };
          u.username = "";
          u.password = "";
          return {
            upstream: `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`,
            token,
            authHeaders: authHeaders2
          };
        } else {
          if (!token) {
            token = decodeURIComponent(u.username);
          }
          u.username = "";
          urlStr = `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`;
        }
      }
    } catch {
    }
    const upstream = urlStr.replace(/\/+$/, "");
    const authHeaders = {};
    if (token) {
      authHeaders.Authorization = `Bearer ${token}`;
    }
    return { upstream, token, authHeaders };
  }

  // src/cache.ts
  var negativeCache = /* @__PURE__ */ new Map();
  var DEFAULT_NEGATIVE_TTL_MS = 10 * 60 * 1e3;
  var MAX_CACHE_ENTRIES = 500;
  function checkNegativeCache(adamId, storefront = "", ttlMs = DEFAULT_NEGATIVE_TTL_MS) {
    const key = storefront ? `${adamId}:${storefront}` : adamId;
    const item = negativeCache.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp > ttlMs) {
      negativeCache.delete(key);
      return null;
    }
    return item.reason;
  }
  function recordNegativeCache(adamId, storefront, reason) {
    const key = storefront ? `${adamId}:${storefront}` : adamId;
    if (negativeCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = negativeCache.keys().next().value;
      if (oldestKey) negativeCache.delete(oldestKey);
    }
    negativeCache.set(key, {
      timestamp: Date.now(),
      reason
    });
  }

  // src/index.ts
  var DEFAULT_UPSTREAM = "https://music.ak1ra.de5.net";
  var DEFAULT_TIMEOUT_MS = 4500;
  var SETTINGS = [
    {
      key: "preferDolbyAtmos",
      type: "switch",
      label: "\u4F18\u5148\u675C\u6BD4\u5168\u666F\u58F0 (Dolby Atmos)",
      description: "\u82E5\u66F2\u76EE\u63D0\u4F9B\u675C\u6BD4\u5168\u666F\u58F0 / \u7A7A\u95F4\u97F3\u9891 (ec-3 \u7F16\u7801) \u97F3\u8F68\uFF0C\u65E0\u8BBA\u8BF7\u6C42\u4F55\u79CD\u97F3\u8D28\u5747\u4F18\u5148\u8FD4\u56DE\u8BE5\u97F3\u8F68\uFF08\u9700\u64AD\u653E\u8BBE\u5907\u53CA\u7CFB\u7EDF\u652F\u6301\u591A\u58F0\u9053\u8F93\u51FA\uFF09",
      default: false
    },
    {
      key: "upstreamUrl",
      type: "text",
      label: "\u4E0A\u6E38\u670D\u52A1\u5730\u5740",
      description: "\u63D0\u4F9B\u97F3\u6E90\u89E3\u6790\u4E0E\u89E3\u5BC6\u6D41\u4EE3\u7406\u7684\u670D\u52A1\u7AEF\u70B9\uFF08\u652F\u6301 am-hook \u4E0E wrapper-manager\uFF0C\u672B\u5C3E\u4E0D\u5E26\u659C\u6760\uFF09",
      placeholder: "https://music.ak1ra.de5.net",
      default: "https://music.ak1ra.de5.net"
    },
    {
      key: "upstreamToken",
      type: "text",
      label: "\u4E0A\u6E38\u9274\u6743 Token (\u53EF\u9009)",
      description: "\u82E5\u4E0A\u6E38\u670D\u52A1\u5F00\u542F\u4E86\u9274\u6743\u4FDD\u62A4\uFF08\u5982 wrapper-manager-relay\uFF09\uFF0C\u8BF7\u5728\u6B64\u586B\u5199 Bearer Token / \u8BBF\u95EE\u5BC6\u94A5",
      placeholder: "\u4F8B\u5982: eyJhbGciOi...",
      default: ""
    },
    {
      key: "requestTimeout",
      type: "number",
      label: "\u89E3\u6790\u8D85\u65F6\u65F6\u95F4 (\u6BEB\u79D2)",
      description: "\u5411\u670D\u52A1\u4E0A\u6E38\u53D1\u8D77\u89E3\u6790\u8BF7\u6C42\u7684\u8D85\u65F6\u65F6\u95F4\uFF0C\u5EFA\u8BAE 3000~6000ms \u4E4B\u95F4\u4EE5\u907F\u514D\u5207\u6B4C\u5047\u6B7B",
      default: 4500,
      min: 1e3,
      max: 15e3
    }
  ];
  splayer.register({
    sources: {
      am: {
        name: "Apple Music",
        actions: ["musicUrl"],
        qualities: ["hi-res", "lossless", "hq", "sq", "lq"]
      }
    },
    settings: SETTINGS
  });
  splayer.on("musicUrl", async (req) => {
    const { source, quality, musicInfo } = req;
    if (source !== "am") {
      throw new Error(`[am-hook] \u4E0D\u652F\u6301\u7684\u6E90\u7C7B\u578B: ${source}`);
    }
    const adamId = extractAdamId(musicInfo);
    if (!adamId) {
      const rawHint = musicInfo.id || musicInfo.songmid || musicInfo.name || "\u672A\u77E5";
      throw new Error(`[am-hook] \u65E0\u6CD5\u4ECE\u66F2\u76EE\u4FE1\u606F\u4E2D\u63D0\u53D6\u6709\u6548\u7684 Apple Music Adam ID (${rawHint})`);
    }
    const storefront = getStorefront(musicInfo);
    const cachedError = checkNegativeCache(adamId, storefront);
    if (cachedError) {
      throw new Error(`[am-hook] \u66F2\u76EE\u5728 [${storefront}] \u5730\u533A\u77ED\u671F\u5185\u89E3\u6790\u5931\u8D25\uFF0C\u5DF2\u8DF3\u8FC7: ${cachedError}`);
    }
    const preferDolbyAtmos = Boolean(splayer.getSetting("preferDolbyAtmos") ?? false);
    const rawUpstream = splayer.getSetting("upstreamUrl") || DEFAULT_UPSTREAM;
    const rawToken = splayer.getSetting("upstreamToken") || "";
    const { upstream, token, authHeaders } = parsePluginUpstream(rawUpstream, rawToken);
    const timeoutMs = Number(splayer.getSetting("requestTimeout")) || DEFAULT_TIMEOUT_MS;
    try {
      let masterUrl = "";
      let variants = [];
      let isHookProxy = false;
      const amHookEndpoint = `${upstream}/parse/${adamId}?storefront=${encodeURIComponent(storefront)}`;
      try {
        const res = await splayer.request(amHookEndpoint, {
          method: "GET",
          timeout: timeoutMs,
          headers: {
            Accept: "application/json",
            "User-Agent": "SPlayer-Next/1412.applemusic",
            ...authHeaders
          }
        });
        const status = res.status ?? res.statusCode;
        if (status === 200) {
          const data = typeof res.body === "string" ? JSON.parse(res.body) : JSON.parse(new TextDecoder().decode(res.body));
          if (data.masterUrl && Array.isArray(data.variants) && data.variants.length > 0) {
            masterUrl = data.masterUrl;
            variants = data.variants;
            isHookProxy = Boolean(data.hook);
          }
        }
      } catch {
      }
      if (variants.length === 0) {
        const wmM3u8Endpoint = `${upstream}/m3u8?adamId=${encodeURIComponent(adamId)}&storefront=${encodeURIComponent(storefront)}`;
        const res = await splayer.request(wmM3u8Endpoint, {
          method: "GET",
          timeout: timeoutMs,
          headers: {
            Accept: "application/json",
            "User-Agent": "SPlayer-Next/1412.applemusic",
            ...authHeaders
          }
        });
        const status = res.status ?? res.statusCode;
        if (status !== 200) {
          throw new Error(`\u4E0A\u6E38\u670D\u52A1\u5668\u54CD\u5E94 HTTP ${status}`);
        }
        const wmRes = typeof res.body === "string" ? JSON.parse(res.body) : JSON.parse(new TextDecoder().decode(res.body));
        if (!wmRes.data?.m3u8) {
          throw new Error(wmRes.msg || `\u672A\u80FD\u89E3\u6790\u5230 [${storefront}] \u5730\u533A\u8BE5\u66F2\u76EE\u7684 Master M3U8 \u6E05\u5355`);
        }
        masterUrl = wmRes.data.m3u8;
        const masterContentRes = await splayer.request(masterUrl, {
          method: "GET",
          timeout: timeoutMs,
          headers: {
            "User-Agent": "iTunes/12.11.3 (Windows; Microsoft Windows 10.0.19045)"
          }
        });
        const masterContent = typeof masterContentRes.body === "string" ? masterContentRes.body : new TextDecoder().decode(masterContentRes.body);
        variants = parseMasterM3u8(masterContent, masterUrl);
      }
      if (!masterUrl || variants.length === 0) {
        throw new Error(`\u672A\u80FD\u89E3\u6790\u5230 [${storefront}] \u5730\u533A\u8BE5\u66F2\u76EE\u7684\u53EF\u7528\u97F3\u8F68\u53D8\u4F53`);
      }
      const matched = pickBestVariant(variants, quality, preferDolbyAtmos);
      if (!matched) {
        throw new Error(`\u672A\u80FD\u627E\u5230\u7B26\u5408\u8981\u6C42 (${quality}) \u7684\u53EF\u64AD\u653E\u97F3\u9891\u53D8\u4F53`);
      }
      const baseUrl = masterUrl.slice(0, masterUrl.lastIndexOf("/") + 1);
      let streamUrl;
      if (splayer.appleMusic?.getStreamUrl && matched.variant.uri) {
        const m3u8Url = matched.variant.uri.startsWith("http://") || matched.variant.uri.startsWith("https://") ? matched.variant.uri : `${baseUrl}${matched.variant.uri}`;
        streamUrl = await splayer.appleMusic.getStreamUrl(adamId, m3u8Url, upstream, token);
        splayer.log.info(`[am-hook] \u542F\u7528\u672C\u5730 WASM \u6781\u901F\u76F4\u8FDE\u89E3\u5BC6\u6D41: ${streamUrl}`);
      } else {
        if (!isHookProxy || !matched.variant.file_uri) {
          throw new Error("\u4E0A\u6E38\u5B9E\u4F8B\u672A\u5F00\u542F\u670D\u52A1\u7AEF\u89E3\u5BC6\u6D41\u4EE3\u7406\uFF0C\u4E14\u5BBF\u4E3B\u672A\u5C31\u7EEA\u672C\u5730\u89E3\u5BC6");
        }
        streamUrl = `${upstream}/${baseUrl}${matched.variant.file_uri}`;
        splayer.log.info(`[am-hook] \u964D\u7EA7\u81F3\u670D\u52A1\u7AEF\u4E2D\u8F6C\u89E3\u5BC6\u6D41: ${streamUrl}`);
      }
      splayer.log.info(
        `[am-hook] \u6210\u529F\u89E3\u6790 [${storefront}] Adam ID ${adamId} -> \u7F16\u7801: ${matched.variant.codecs}, \u8D28\u91CF: ${matched.quality}` + (preferDolbyAtmos && matched.variant.codecs.includes("ec-3") ? " (\u675C\u6BD4\u5168\u666F\u58F0)" : "")
      );
      return {
        url: streamUrl,
        quality: matched.quality
      };
    } catch (err) {
      const message = err.message || String(err);
      recordNegativeCache(adamId, storefront, message);
      splayer.log.warn(`[am-hook] [${storefront}] \u89E3\u6790\u5931\u8D25 (${adamId}): ${message}`);
      throw new Error(`[am-hook] \u97F3\u6E90\u89E3\u6790\u5931\u8D25: ${message}`);
    }
  });
})();
