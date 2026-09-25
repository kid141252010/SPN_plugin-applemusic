/**
 * @name Apple Music 音源插件
 * @id splayer.plugin.applemusic
 * @version 1.0.0
 * @description 基于 am-hook 上游服务为 SPlayer-Next 提供 Apple Music 音频流解析支持（支持 Hi-Res、Lossless 无损及杜比全景声）
 * @author SPlayer
 * @type source
 * @apiLevel 2
 */

"use strict";
(() => {
  // src/extractor.ts
  function extractAdamId(musicInfo) {
    if (!musicInfo) return null;
    const candidates = [
      musicInfo.meta?.songId,
      musicInfo.songId,
      musicInfo.id,
      musicInfo.songmid
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
      if (str.includes("music.apple.com")) {
        const trackParamMatch = str.match(/[?&]i=(\d{5,12})/);
        if (trackParamMatch) {
          return trackParamMatch[1];
        }
        const songPathMatch = str.match(/\/song\/(?:[^\/]+\/)?(\d{5,12})/i);
        if (songPathMatch) {
          return songPathMatch[1];
        }
        const albumPathMatch = str.match(/\/album\/(?:[^\/]+\/)?(\d{5,12})/i);
        if (albumPathMatch) {
          return albumPathMatch[1];
        }
      }
      const generalMatch = str.match(/\b(\d{6,12})\b/);
      if (generalMatch) {
        return generalMatch[1];
      }
    }
    return null;
  }
  function resolveStorefront(musicInfo, fallback = "cn") {
    if (!musicInfo) return fallback.toLowerCase();
    const info = musicInfo;
    const meta = musicInfo.meta || {};
    const candidates = [
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
      meta.country
    ];
    for (const raw of candidates) {
      if (typeof raw !== "string") continue;
      const str = raw.trim().toLowerCase();
      if (!str) continue;
      if (/^[a-z]{2}$/.test(str)) {
        return str;
      }
      const localeMatch = str.match(/[-_]([a-z]{2})$/);
      if (localeMatch) {
        return localeMatch[1];
      }
    }
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
      key: "defaultStorefront",
      type: "select",
      label: "\u9ED8\u8BA4 Storefront \u5730\u533A\u4EE3\u7801",
      description: "\u5F53\u5BBF\u4E3B\u672C\u4F53\u672A\u4F20\u9012\u5730\u533A\u3001\u4E14\u94FE\u63A5\u672A\u5305\u542B\u5730\u533A\u8DEF\u5F84\u65F6\u7684\u515C\u5E95 Apple Music \u5730\u533A",
      default: "cn",
      options: [
        { label: "\u4E2D\u56FD\u5927\u9646 (cn)", value: "cn" },
        { label: "\u7F8E\u56FD (us)", value: "us" },
        { label: "\u65E5\u672C (jp)", value: "jp" },
        { label: "\u571F\u8033\u5176 (tr)", value: "tr" },
        { label: "\u97E9\u56FD (kr)", value: "kr" },
        { label: "\u4E2D\u56FD\u9999\u6E2F (hk)", value: "hk" },
        { label: "\u4E2D\u56FD\u53F0\u6E7E (tw)", value: "tw" },
        { label: "\u82F1\u56FD (gb)", value: "gb" }
      ]
    },
    {
      key: "upstreamUrl",
      type: "text",
      label: "am-hook \u4E0A\u6E38\u670D\u52A1\u5730\u5740",
      description: "\u63D0\u4F9B\u97F3\u6E90\u89E3\u6790\u4E0E\u89E3\u5BC6\u6D41\u4EE3\u7406\u7684 am-hook \u670D\u52A1\u7AEF\u70B9\uFF0C\u652F\u6301\u914D\u7F6E\u81EA\u5EFA\u8282\u70B9\uFF08\u672B\u5C3E\u4E0D\u5E26\u659C\u6760\uFF09",
      placeholder: "https://music.ak1ra.de5.net",
      default: "https://music.ak1ra.de5.net"
    },
    {
      key: "requestTimeout",
      type: "number",
      label: "\u89E3\u6790\u8D85\u65F6\u65F6\u95F4 (\u6BEB\u79D2)",
      description: "\u5411 am-hook \u4E0A\u6E38\u53D1\u8D77\u89E3\u6790\u8BF7\u6C42\u7684\u8D85\u65F6\u65F6\u95F4\uFF0C\u5EFA\u8BAE 3000~6000ms \u4E4B\u95F4\u4EE5\u907F\u514D\u5207\u6B4C\u5047\u6B7B",
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
    const configuredStorefront = splayer.getSetting("defaultStorefront") || "cn";
    const storefront = resolveStorefront(musicInfo, configuredStorefront);
    const cachedError = checkNegativeCache(adamId, storefront);
    if (cachedError) {
      throw new Error(`[am-hook] \u66F2\u76EE\u5728 [${storefront}] \u5730\u533A\u77ED\u671F\u5185\u89E3\u6790\u5931\u8D25\uFF0C\u5DF2\u8DF3\u8FC7: ${cachedError}`);
    }
    const preferDolbyAtmos = Boolean(splayer.getSetting("preferDolbyAtmos") ?? false);
    const rawUpstream = splayer.getSetting("upstreamUrl") || DEFAULT_UPSTREAM;
    const upstream = rawUpstream.trim().replace(/\/+$/, "");
    const timeoutMs = Number(splayer.getSetting("requestTimeout")) || DEFAULT_TIMEOUT_MS;
    const parseEndpoint = `${upstream}/parse/${adamId}?storefront=${encodeURIComponent(
      storefront
    )}&cc=${encodeURIComponent(storefront)}&region=${encodeURIComponent(storefront)}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await splayer.request(parseEndpoint, {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "SPlayer-Next/Plugin-AppleMusic"
        }
      });
      clearTimeout(timer);
      if (res.statusCode !== 200) {
        throw new Error(`\u4E0A\u6E38\u670D\u52A1\u5668\u54CD\u5E94 HTTP ${res.statusCode}`);
      }
      const data = typeof res.body === "string" ? JSON.parse(res.body) : JSON.parse(new TextDecoder().decode(res.body));
      if (!data.masterUrl || !Array.isArray(data.variants) || data.variants.length === 0) {
        throw new Error(data.msg || `\u672A\u80FD\u89E3\u6790\u5230 [${storefront}] \u5730\u533A\u8BE5\u66F2\u76EE\u7684\u53EF\u7528\u97F3\u8F68\u53D8\u4F53`);
      }
      if (!data.hook) {
        throw new Error("\u4E0A\u6E38 am-hook \u5B9E\u4F8B\u672A\u5F00\u542F --hook \u670D\u52A1\u7AEF\u89E3\u5BC6\u6D41\u4EE3\u7406\u6A21\u5F0F\uFF0C\u65E0\u6CD5\u76F4\u63A5\u64AD\u653E");
      }
      const matched = pickBestVariant(data.variants, quality, preferDolbyAtmos);
      if (!matched || !matched.variant.file_uri) {
        throw new Error(`\u672A\u80FD\u627E\u5230\u7B26\u5408\u8981\u6C42 (${quality}) \u7684\u53EF\u64AD\u653E\u97F3\u9891\u53D8\u4F53`);
      }
      const baseUrl = data.masterUrl.slice(0, data.masterUrl.lastIndexOf("/") + 1);
      const streamUrl = `${upstream}/${baseUrl}${matched.variant.file_uri}`;
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
