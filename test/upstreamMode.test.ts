import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearUpstreamMode,
  getCachedUpstreamModeSync,
  getEffectiveUpstreamMode,
  recordUpstreamMode,
} from "../src/upstreamMode";

describe("upstreamMode (上游架构模式自适应缓存)", () => {
  beforeEach(() => {
    clearUpstreamMode();
    // 清理全局 mock
    // @ts-expect-error mock splayer
    delete globalThis.splayer;
  });

  afterEach(() => {
    clearUpstreamMode();
  });

  it("默认 auto 下无缓存时返回 undefined", async () => {
    const mode = await getEffectiveUpstreamMode("https://music.example.com", "auto");
    expect(mode).toBeUndefined();
  });

  it("当用户显式配置 wm 或 am-hook 时，直接返回该模式", async () => {
    const wmMode = await getEffectiveUpstreamMode("https://music.example.com", "wm");
    expect(wmMode).toBe("wm");

    const amMode = await getEffectiveUpstreamMode("https://music.example.com", "am-hook");
    expect(amMode).toBe("am-hook");
  });

  it("自适应记录 wm 后，auto 模式下直接命中 wm", async () => {
    recordUpstreamMode("https://music.example.com", "wm");

    expect(getCachedUpstreamModeSync("https://music.example.com")).toBe("wm");
    const mode = await getEffectiveUpstreamMode("https://music.example.com", "auto");
    expect(mode).toBe("wm");
  });

  it("自适应记录 am-hook 后，auto 模式下直接命中 am-hook", async () => {
    recordUpstreamMode("https://music.example.com", "am-hook");

    expect(getCachedUpstreamModeSync("https://music.example.com")).toBe("am-hook");
    const mode = await getEffectiveUpstreamMode("https://music.example.com", "auto");
    expect(mode).toBe("am-hook");
  });

  it("自动规范化 URL 末尾斜杠并命中相同缓存", async () => {
    recordUpstreamMode("https://music.example.com/api/", "wm");

    const mode = await getEffectiveUpstreamMode("https://music.example.com/api", "auto");
    expect(mode).toBe("wm");
  });

  it("支持从 splayer.storage 持久化恢复模式记录", async () => {
    const fakeStorage = new Map<string, string>();
    fakeStorage.set("upstream_mode:https://music.example.com", "wm");

    // @ts-expect-error mock splayer host
    globalThis.splayer = {
      storage: {
        get: vi.fn(async (key: string) => fakeStorage.get(key) ?? null),
        set: vi.fn(async (key: string, val: string) => fakeStorage.set(key, val)),
        remove: vi.fn(async (key: string) => fakeStorage.delete(key)),
      },
    };

    const mode = await getEffectiveUpstreamMode("https://music.example.com", "auto");
    expect(mode).toBe("wm");
    expect(getCachedUpstreamModeSync("https://music.example.com")).toBe("wm");
  });

  it("clearUpstreamMode 可单独或全部清空缓存", async () => {
    recordUpstreamMode("https://a.com", "wm");
    recordUpstreamMode("https://b.com", "am-hook");

    clearUpstreamMode("https://a.com");
    expect(getCachedUpstreamModeSync("https://a.com")).toBeUndefined();
    expect(getCachedUpstreamModeSync("https://b.com")).toBe("am-hook");

    clearUpstreamMode();
    expect(getCachedUpstreamModeSync("https://b.com")).toBeUndefined();
  });
});
