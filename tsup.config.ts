import { defineConfig } from "tsup";

const banner = `/**
 * @name Apple Music 音源
 * @id 1412.applemusic
 * @version 1.1.0
 * @description 基于 am-hook 上游服务为 SPlayer-Next 提供 Apple Music 音频流解析支持（支持 Hi-Res、Lossless 无损及杜比全景声）
 * @author 1412
 * @type source
 * @apiLevel 2
 * @updateUrl https://raw.githubusercontent.com/kid141252010/applemusic/main/dist/1412.applemusic.js
 * @changelog 支持客户端本地 WASM 解密流代理，实现 Apple CDN 直连秒开\\n优化 Storefront 地区解析
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
