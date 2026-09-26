import { describe, it, expect } from "vitest";
import { parsePluginUpstream } from "../src/upstream";

describe("上游地址与鉴权凭证解析测试", () => {
  it("应正确解析 URL 中内嵌的 Token", () => {
    const res = parsePluginUpstream("https://mock-token-xyz@example.com/");
    expect(res.upstream).toBe("https://example.com");
    expect(res.token).toBe("mock-token-xyz");
    expect(res.authHeaders.Authorization).toBe("Bearer mock-token-xyz");
  });

  it("应正确处理显式配置的 Token", () => {
    const res = parsePluginUpstream("https://wm.wol.moe", "my-token");
    expect(res.upstream).toBe("https://wm.wol.moe");
    expect(res.token).toBe("my-token");
    expect(res.authHeaders.Authorization).toBe("Bearer my-token");
  });

  it("应在 URL 和显式均存在时优先使用显式 Token", () => {
    const res = parsePluginUpstream("https://url-token@wm.wol.moe", "explicit-token");
    expect(res.upstream).toBe("https://wm.wol.moe");
    expect(res.token).toBe("explicit-token");
    expect(res.authHeaders.Authorization).toBe("Bearer explicit-token");
  });

  it("应正确处理无 Token 的标准上游", () => {
    const res = parsePluginUpstream("https://music.ak1ra.de5.net");
    expect(res.upstream).toBe("https://music.ak1ra.de5.net");
    expect(res.token).toBeUndefined();
    expect(res.authHeaders.Authorization).toBeUndefined();
  });
});
