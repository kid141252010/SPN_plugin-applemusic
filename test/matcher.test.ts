import { describe, it, expect } from "vitest";
import { pickBestVariant } from "../src/matcher";
import type { AmVariant } from "../src/types";

const mockVariants: AmVariant[] = [
  {
    audio: "songEnhanced",
    bandwidth: 259835,
    bit_depth: null,
    channels: "2/-/BINAURAL",
    codecs: "mp4a.40.2",
    file_uri: "audio_en_gr256_mp4a-40-2_bm_m.mp4",
    group_id: "audio-stereo-256-binaural",
    sample_rate: null,
    uri: "audio_en_gr256_mp4a-40-2_bm.m3u8",
  },
  {
    audio: "songEnhanced",
    bandwidth: 259089,
    bit_depth: null,
    channels: "2",
    codecs: "mp4a.40.2",
    file_uri: "audio_en_gr256_mp4a-40-2_m.mp4",
    group_id: "audio-stereo-256",
    sample_rate: null,
    uri: "audio_en_gr256_mp4a-40-2.m3u8",
  },
  {
    audio: "songEnhanced",
    bandwidth: 770212,
    bit_depth: null,
    channels: "16/JOC",
    codecs: "ec-3",
    file_uri: "audio_en_gr2768_mp4a-A6_m.mp4",
    group_id: "audio-atmos-2768",
    sample_rate: null,
    uri: "audio_en_gr2768_mp4a-A6.m3u8",
  },
  {
    audio: "songEnhanced",
    bandwidth: 450212,
    bit_depth: null,
    channels: "16/JOC",
    codecs: "ec-3",
    file_uri: "audio_en_gr2448_mp4a-A6_m.mp4",
    group_id: "audio-atmos-2448",
    sample_rate: null,
    uri: "audio_en_gr2448_mp4a-A6.m3u8",
  },
  {
    audio: "songEnhanced",
    bandwidth: 1673776,
    bit_depth: 24,
    channels: "2",
    codecs: "alac",
    file_uri: "audio_en_gr2116_alac_m.mp4",
    group_id: "audio-alac-stereo-44100-24",
    sample_rate: 44100,
    uri: "audio_en_gr2116_alac.m3u8",
  },
  {
    audio: "songEnhanced",
    bandwidth: 132325,
    bit_depth: null,
    channels: "2",
    codecs: "mp4a.40.2",
    file_uri: "audio_en_gr128_mp4a-40-2_m.mp4",
    group_id: "audio-stereo-128",
    sample_rate: null,
    uri: "audio_en_gr128_mp4a-40-2.m3u8",
  },
  {
    audio: "songEnhanced",
    bandwidth: 68306,
    bit_depth: null,
    channels: "2",
    codecs: "mp4a.40.5",
    file_uri: "audio_en_gr64_mp4a-40-2_m.mp4",
    group_id: "audio-HE-stereo-64",
    sample_rate: null,
    uri: "audio_en_gr64_mp4a-40-2.m3u8",
  },
];

describe("pickBestVariant", () => {
  it("当开启 preferDolbyAtmos 时，应优先选中最高码率的杜比全景声 (ec-3 768k)", () => {
    const res = pickBestVariant(mockVariants, "lossless", true);
    expect(res).not.toBeNull();
    expect(res?.variant.codecs).toBe("ec-3");
    expect(res?.variant.group_id).toBe("audio-atmos-2768");
    expect(res?.quality).toBe("hi-res");
  });

  it("当未开启 preferDolbyAtmos 时，请求 lossless 应返回标准 ALAC 无损", () => {
    const res = pickBestVariant(mockVariants, "lossless", false);
    expect(res).not.toBeNull();
    expect(res?.variant.codecs).toBe("alac");
    expect(res?.variant.sample_rate).toBe(44100);
    expect(res?.quality).toBe("lossless");
  });

  it("请求 hq 时应返回标准 256k AAC (并优先常规立体声而不是 Binaural)", () => {
    const res = pickBestVariant(mockVariants, "hq", false);
    expect(res).not.toBeNull();
    expect(res?.variant.codecs).toBe("mp4a.40.2");
    expect(res?.variant.group_id).toBe("audio-stereo-256");
    expect(res?.quality).toBe("hq");
  });

  it("请求 sq 时应返回 128k AAC", () => {
    const res = pickBestVariant(mockVariants, "sq", false);
    expect(res).not.toBeNull();
    expect(res?.variant.group_id).toBe("audio-stereo-128");
    expect(res?.quality).toBe("sq");
  });

  it("请求 lq 时应返回 64k HE-AAC", () => {
    const res = pickBestVariant(mockVariants, "lq", false);
    expect(res).not.toBeNull();
    expect(res?.variant.codecs).toBe("mp4a.40.5");
    expect(res?.quality).toBe("lq");
  });

  it("当曲目无杜比全景声但开启 preferDolbyAtmos 时，应优雅降级到请求的音质档位", () => {
    const nonAtmosVariants = mockVariants.filter((v) => v.codecs !== "ec-3");
    const res = pickBestVariant(nonAtmosVariants, "lossless", true);
    expect(res).not.toBeNull();
    expect(res?.variant.codecs).toBe("alac");
    expect(res?.quality).toBe("lossless");
  });
});
