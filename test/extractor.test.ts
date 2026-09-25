import { describe, it, expect } from "vitest";
import { extractAdamId, resolveStorefront } from "../src/extractor";

describe("extractAdamId", () => {
  it("应正确解析纯数字字符串 ID", () => {
    expect(extractAdamId({ songmid: "1468058171", id: "1468058171" })).toBe("1468058171");
  });

  it("应正确解析数字类型 ID", () => {
    expect(extractAdamId({ songmid: 1468058171, id: 1468058171 })).toBe("1468058171");
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

describe("resolveStorefront", () => {
  it("应优先读取本体显式传入的 storefront (支持 camelCase storeFront / 大写 / 空格)", () => {
    expect(resolveStorefront({ songmid: "1468058171", storefront: "us" })).toBe("us");
    expect(resolveStorefront({ songmid: "1468058171", storefront: "JP" })).toBe("jp");
    expect(resolveStorefront({ songmid: "1468058171", storeFront: "jp" } as any)).toBe("jp");
    expect(resolveStorefront({ songmid: "1468058171", StoreFront: " kr " } as any)).toBe("kr");
  });

  it("应正确处理 zh-CN 或 en-US 等 Locale 格式", () => {
    expect(resolveStorefront({ songmid: "1468058171", storefront: "zh-CN" })).toBe("cn");
    expect(resolveStorefront({ songmid: "1468058171", storeFront: "en_US" } as any)).toBe("us");
  });

  it("应读取 meta.storefront / meta.storeFront / meta.country / meta.region", () => {
    expect(
      resolveStorefront({
        songmid: "1468058171",
        meta: { storefront: "tr" },
      }),
    ).toBe("tr");
    expect(
      resolveStorefront({
        songmid: "1468058171",
        meta: { storeFront: "jp" },
      } as any),
    ).toBe("jp");
    expect(
      resolveStorefront({
        songmid: "1468058171",
        meta: { country: "kr" },
      }),
    ).toBe("kr");
    expect(
      resolveStorefront({
        songmid: "1468058171",
        meta: { region: "hk" },
      }),
    ).toBe("hk");
  });

  it("当本体未传时，应从 Apple Music Web 链接路径中提取国家代码", () => {
    const url = "https://music.apple.com/jp/song/someone-you-loved/1468058171";
    expect(resolveStorefront({ songmid: url })).toBe("jp");
  });

  it("无任何地区信息时应退回默认 fallback (cn)", () => {
    expect(resolveStorefront({ songmid: "1468058171" })).toBe("cn");
    expect(resolveStorefront({ songmid: "1468058171" }, "us")).toBe("us");
  });
});
