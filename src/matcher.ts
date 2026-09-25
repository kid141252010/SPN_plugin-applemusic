import type { AmVariant, PluginQuality } from "./types";

export interface MatchResult {
  variant: AmVariant;
  quality: PluginQuality;
}

/**
 * 判断是否为杜比全景声 (Dolby Atmos) 变体
 */
export function isDolbyAtmos(v: AmVariant): boolean {
  const codecs = (v.codecs || "").toLowerCase();
  const channels = (v.channels || "").toLowerCase();
  const groupId = (v.group_id || "").toLowerCase();

  return (
    codecs === "ec-3" ||
    codecs === "ec3" ||
    channels.includes("joc") ||
    groupId.includes("atmos")
  );
}

/**
 * 判断是否为 ALAC 无损变体
 */
export function isAlac(v: AmVariant): boolean {
  return (v.codecs || "").toLowerCase() === "alac";
}

/**
 * 判断是否为 Hi-Res 高解析度无损 (≥ 88.2kHz 且 ≥ 24bit)
 */
export function isHiResAlac(v: AmVariant): boolean {
  if (!isAlac(v)) return false;
  const sampleRate = v.sample_rate || 0;
  const bitDepth = v.bit_depth || 0;
  return sampleRate >= 88200 && bitDepth >= 24;
}

/**
 * 判断是否为标准 AAC 立体声 (mp4a.40.2)
 */
export function isStandardAac(v: AmVariant): boolean {
  return (v.codecs || "").toLowerCase().startsWith("mp4a.40.2");
}

/**
 * 判断是否为高效 AAC (HE-AAC / mp4a.40.5)
 */
export function isHeAac(v: AmVariant): boolean {
  return (v.codecs || "").toLowerCase().startsWith("mp4a.40.5");
}

/**
 * 变体权重评分：标准两声道立体声优先于人工双耳声(Binaural)或折叠混音(Downmix)
 */
function channelPreferenceScore(v: AmVariant): number {
  const channels = (v.channels || "").toUpperCase();
  const groupId = (v.group_id || "").toUpperCase();
  if (channels.includes("BINAURAL") || groupId.includes("BINAURAL")) return -1;
  if (channels.includes("DOWNMIX") || groupId.includes("DOWNMIX")) return -1;
  return 1;
}

/**
 * 从 am-hook 返回的 variants 列表中挑选最符合要求的音轨
 * @param variants 变体音轨列表
 * @param targetQuality 目标音质等级 ("hi-res" | "lossless" | "hq" | "sq" | "lq")
 * @param preferDolbyAtmos 是否开启「优先杜比全景声」高级选项
 */
export function pickBestVariant(
  variants: AmVariant[],
  targetQuality: PluginQuality,
  preferDolbyAtmos = false,
): MatchResult | null {
  if (!Array.isArray(variants) || variants.length === 0) {
    return null;
  }

  // 1. 如果启用了「优先杜比全景声」，检测曲目是否存在 Atmos 音轨
  if (preferDolbyAtmos) {
    const atmosVariants = variants
      .filter(isDolbyAtmos)
      .sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));

    if (atmosVariants.length > 0) {
      // 优先选最高码率的 Atmos 轨（如 768kbps 优于 448kbps）
      return {
        variant: atmosVariants[0],
        quality: "hi-res",
      };
    }
  }

  // 提取分类音轨
  const alacVariants = variants
    .filter(isAlac)
    .sort((a, b) => {
      // 采样率降序 -> 位深降序 -> 码率降序
      const srDiff = (b.sample_rate || 0) - (a.sample_rate || 0);
      if (srDiff !== 0) return srDiff;
      const bdDiff = (b.bit_depth || 0) - (a.bit_depth || 0);
      if (bdDiff !== 0) return bdDiff;
      return (b.bandwidth || 0) - (a.bandwidth || 0);
    });

  const standardAacVariants = variants
    .filter(isStandardAac)
    .sort((a, b) => {
      // 优先标准立体声，其次按码率降序
      const prefDiff = channelPreferenceScore(b) - channelPreferenceScore(a);
      if (prefDiff !== 0) return prefDiff;
      return (b.bandwidth || 0) - (a.bandwidth || 0);
    });

  const heAacVariants = variants
    .filter(isHeAac)
    .sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));

  // 2. 根据目标音质梯队决策
  if (targetQuality === "hi-res") {
    // 优先 24bit/96kHz+ 的 Hi-Res ALAC
    const hiRes = alacVariants.find(isHiResAlac);
    if (hiRes) return { variant: hiRes, quality: "hi-res" };

    // 其次标准 ALAC 无损
    if (alacVariants.length > 0) {
      return { variant: alacVariants[0], quality: "lossless" };
    }

    // 再次 AAC 256k
    if (standardAacVariants.length > 0) {
      return { variant: standardAacVariants[0], quality: "hq" };
    }
  }

  if (targetQuality === "lossless") {
    // 优先 44.1k/48k 标准无损
    const standardLossless =
      alacVariants.find((v) => (v.sample_rate || 0) <= 48000) || alacVariants[0];
    if (standardLossless) {
      return {
        variant: standardLossless,
        quality: isHiResAlac(standardLossless) ? "hi-res" : "lossless",
      };
    }

    // 回退到高码率 AAC 256k
    if (standardAacVariants.length > 0) {
      return { variant: standardAacVariants[0], quality: "hq" };
    }
  }

  if (targetQuality === "hq") {
    // 优先高码率 AAC 256k (bandwidth 通常 > 200,000)
    const aac256 = standardAacVariants.find((v) => (v.bandwidth || 0) > 200000);
    if (aac256) return { variant: aac256, quality: "hq" };

    if (standardAacVariants.length > 0) {
      return { variant: standardAacVariants[0], quality: "hq" };
    }

    // 回退到 ALAC 或其他可用轨
    if (alacVariants.length > 0) {
      return { variant: alacVariants[0], quality: "lossless" };
    }
  }

  if (targetQuality === "sq") {
    // 标准音质：约 128kbps AAC
    const aac128 = standardAacVariants.find((v) => (v.bandwidth || 0) <= 200000);
    if (aac128) return { variant: aac128, quality: "sq" };

    if (standardAacVariants.length > 0) {
      return {
        variant: standardAacVariants[standardAacVariants.length - 1],
        quality: "sq",
      };
    }

    if (heAacVariants.length > 0) {
      return { variant: heAacVariants[0], quality: "lq" };
    }
  }

  if (targetQuality === "lq") {
    // 低音质：HE-AAC 64k
    if (heAacVariants.length > 0) {
      return { variant: heAacVariants[0], quality: "lq" };
    }

    // 或码率最低的 AAC
    if (standardAacVariants.length > 0) {
      const lowestAac = standardAacVariants[standardAacVariants.length - 1];
      return { variant: lowestAac, quality: "lq" };
    }
  }

  // 兜底返回任意最高可用音质
  const fallback =
    alacVariants[0] || standardAacVariants[0] || heAacVariants[0] || variants[0];

  let fallbackQuality: PluginQuality = "hq";
  if (isHiResAlac(fallback)) fallbackQuality = "hi-res";
  else if (isAlac(fallback)) fallbackQuality = "lossless";
  else if (isHeAac(fallback)) fallbackQuality = "lq";

  return {
    variant: fallback,
    quality: fallbackQuality,
  };
}
