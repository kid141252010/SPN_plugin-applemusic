import { describe, it, expect } from "vitest";
import { parseMasterM3u8 } from "../src/parser";
import { pickBestVariant } from "../src/matcher";

describe("Master M3U8 解析测试", () => {
  const sampleM3u8 = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-stereo-256",AUTOSELECT=YES,CHANNELS="2",NAME="songEnhanced"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-HE-stereo-64",AUTOSELECT=YES,CHANNELS="2",NAME="songEnhanced"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-stereo-128",AUTOSELECT=YES,CHANNELS="2",NAME="songEnhanced"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-alac-stereo-44100-16",AUTOSELECT=YES,CHANNELS="2",NAME="songEnhanced",SAMPLE-RATE=44100,BIT-DEPTH=16

#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=257983,_AVG-BANDWIDTH=257983,BANDWIDTH=273850,CODECS="mp4a.40.2",STABLE-VARIANT-ID="6bc32492a668b13b479e4018c66c29f59468cfbfc4e0001a6d3276059c0d3a94",AUDIO="audio-stereo-256"
P361644943_A1593819875_audio_en_gr256.m3u8
#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=69044,_AVG-BANDWIDTH=69044,BANDWIDTH=77044,CODECS="mp4a.40.5",STABLE-VARIANT-ID="4b1ef1b74041c98c5f11873a06604e3c7d9159f6f2a0ea6dc1502b2c95a2f90f",AUDIO="audio-HE-stereo-64"
P361644943_A1593819875_audio_en_gr64.m3u8
#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=132395,_AVG-BANDWIDTH=132395,BANDWIDTH=137035,CODECS="mp4a.40.2",STABLE-VARIANT-ID="28da3b56028ae57a4c635df38ecd13abda473d0fa2af265a68bcc6c6752e0be2",AUDIO="audio-stereo-128"
P361644943_A1593819875_audio_en_gr128.m3u8
#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=586367,_AVG-BANDWIDTH=586367,BANDWIDTH=655377,CODECS="alac",STABLE-VARIANT-ID="934231ccfbc343fb1201b5ca33322651d95d54caca947008b34e0631ff030eb5",AUDIO="audio-alac-stereo-44100-16"
P361644943_A1593819875_audio_en_gr1411.m3u8`;

  it("应成功解析并提取音轨变体与元数据", () => {
    const variants = parseMasterM3u8(sampleM3u8);
    expect(variants.length).toBe(4);

    const alac = variants.find((v) => v.codecs === "alac");
    expect(alac).toBeDefined();
    expect(alac?.uri).toBe("P361644943_A1593819875_audio_en_gr1411.m3u8");
    expect(alac?.sample_rate).toBe(44100);
    expect(alac?.bit_depth).toBe(16);

    const best = pickBestVariant(variants, "lossless");
    expect(best?.quality).toBe("lossless");
    expect(best?.variant.uri).toBe("P361644943_A1593819875_audio_en_gr1411.m3u8");
  });
});
