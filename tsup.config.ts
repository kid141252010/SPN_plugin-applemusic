import { defineConfig } from "tsup";

const banner = `/**
 * @name Apple Music 音源
 * @id 1412.applemusic
 * @version 1.3.0
 * @description 基于 am-hook 与 wrapper-manager 上游服务为 SPlayer-Next 提供 Apple Music 音频流解析支持（支持 Hi-Res、Lossless 无损及杜比全景声）
 * @author 1412
 * @type source
 * @apiLevel 2
 * @updateUrl https://raw.githubusercontent.com/kid141252010/applemusic/main/dist/1412.applemusic.js
 * @changelog 增加上游架构服务特性自适应记忆缓存，消除盲测 404 等待 (立减 2.1 秒极速直连)\\n增加上游架构模式配置项 (auto/am-hook/wm) 与持久化存储记忆
 */
`;

export default defineConfig({
  entry: {
    "1412.applemusic": "src/index.ts",
  },
  outDir: "dist",
  format: ["iife"],
  clean: true,
  bundle: true,
  minify: false,
  sourcemap: false,
  target: "es2022",
  banner: {
    js: banner,
  },
  outExtension() {
    return {
      js: ".js",
    };
  },
});
