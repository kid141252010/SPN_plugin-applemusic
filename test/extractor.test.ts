import { describe, it, expect } from "vitest";
import { extractAdamId, getStorefront } from "../src/extractor";

describe("extractAdamId", () => {
  it("应正确解析纯数字字符串 ID", () => {
    expect(extractAdamId({ songmid: "1468058171", id: "1468058171" })).toBe("1468058171");
  });

  it("应正确解析数字类型 ID", () => {
    expect(extractAdamId({ songmid: "1468058171", id: "1468058171" })).toBe("1468058171");
  });

  it("应正确解析带前缀的 ID (am_1468058171)", () => {
    expect(extractAdamId({ songmid: "am_1468058171" })).toBe("1468058171");
    expect(extractAdamId({ songmid: "apple:1468058171" })).toBe("1468058171");
  });

  it("应从 Apple Music 单曲链接提取 Adam ID", () => {
    const url = "https://music.apple.com/cn/song/someone-you-loved/1468058171";
    expect(extractAdamId({ songmid: url })).toBe("1468058171");
  });

  it("应从 Apple Music 专辑链接中的 ?i= 参数提取单曲 ID", () => {
    const url = "https://music.apple.com/us/album/divinely-uninspired-to-a-hellish-extent/1468058170?i=1468058171";
    expect(extractAdamId({ songmid: url })).toBe("1468058171");
  });

  it("应优先读取 meta.songId", () => {
    expect(
      extractAdamId({
        songmid: "invalid",
        meta: { songId: "1468058171" },
      }),
    ).toBe("1468058171");
  });

  it("无效输入应返回 null", () => {
    expect(extractAdamId({ songmid: "abc" })).toBeNull();
    expect(extractAdamId({ songmid: "" })).toBeNull();
  });
});

describe("getStorefront", () => {
  it("应直接读取本体透传的 musicInfo.storefront", () => {
    expect(getStorefront({ songmid: "1468058171", storefront: "us" })).toBe("us");
    expect(getStorefront({ songmid: "1468058171", storefront: "jp" })).toBe("jp");
  });

  it("支持大写自动转换为小写", () => {
    expect(getStorefront({ songmid: "1468058171", storefront: "TR" })).toBe("tr");
  });

  it("支持读取 meta.storefront 备选", () => {
    expect(
      getStorefront({
        songmid: "1468058171",
        meta: { storefront: "kr" },
      }),
    ).toBe("kr");
  });

  it("未传 storefront 时安全回退到默认 'cn'", () => {
    expect(getStorefront({ songmid: "1468058171" })).toBe("cn");
  });
});
