# AGENTS.md

本文档记录本项目的背景、架构定位、协作流程以及为 SPlayer-Next 开发 Apple Music 音源插件的完整技术规范，供协作智能体与开发者共同遵守。

---

## 1. 项目背景与定位 (Project Overview)

- **项目定位**：本项目是一个专为 **[SPlayer-Next](https://github.com/SPlayer-Dev/SPlayer-Next)** 桌面音乐播放器打造的 **Apple Music 音源插件**（Source Plugin）。
- **核心目标**：
  - 当 SPlayer-Next 播放来自 Apple Music 平台的曲目（`track.source === "applemusic"`，内部映射 source key 为 `am`）时，为播放器解析并返回高品质、可播放的真实音频流/直链 URL（`musicUrl`）。
  - （可选扩展）提供 Apple Music 优质逐字歌词（TTML 格式）与高清封面元数据兜底（`musicLyric`、`musicPic`、`musicSearch`）。
- **关键参考目录与文档**：
  - **宿主播放器本地源码**：`E:\SPlayer-Next`
  - **官方插件开发文档**：[https://splayer-next.imsyy.top/plugins/](https://splayer-next.imsyy.top/plugins/)
  - **音源插件规范文档**：[https://splayer-next.imsyy.top/plugins/source.html](https://splayer-next.imsyy.top/plugins/source.html)
  - **控制插件与通用 API**：[https://splayer-next.imsyy.top/plugins/control.html](https://splayer-next.imsyy.top/plugins/control.html)
  - **插件市场与更新规范**：[https://splayer-next.imsyy.top/plugins/update.html](https://splayer-next.imsyy.top/plugins/update.html)

---

## 2. 仓库管理与协作流程 (Git & Repository Workflow)

1. **Git 本地初始化**：
   - 本地仓库已在 `E:\applemusic` 完成 `git init`。
2. **远程仓库同步**：
   - 等待用户在 GitHub 上建立远程仓库。
   - 当用户创建完成后，通过 `git remote add origin <GitHub-Repo-URL>` 绑定远程，并将初始化代码推送到主分支（`main` 或 `master`）。
3. **提交规范**：
   - 遵循 Conventional Commits 规范，单行中文摘要：`<type>: <summary>`（例如 `feat: 初始化插件元数据与架构配置`，`docs: 添加开发说明`）。

---

## 3. SPlayer-Next 插件架构与沙箱环境 (Host Sandbox)

插件运行在 SPlayer-Next 的独立插件沙箱中，开发者与 Agent 必须严格遵守以下环境约束：

### 3.1 进程与沙箱模型
- **独立进程**：所有启用的插件共享一个独立的 `splayer-plugin-host` Utility 进程，各插件运行在专有的 `node:vm` 沙箱上下文内。
- **崩溃隔离与自愈**：单个插件崩溃由宿主看门狗自愈重载（按 2s → 8s → 30s 退避），不会影响播放器主界面与正在播放的声音。
- **共享单线程事件循环**：所有插件共享同一进程事件循环，**严禁写同步阻塞代码或死循环**。
- **顶层 5 秒时限**：脚本顶层同步执行必须在 5 秒内完成，耗时操作必须进入异步处理器。

### 3.2 运行环境与全局可用对象
- **禁止 Node 模块与原生 API**：没有 `fs`、`net`、`path`、`child_process`，无 `require` / `import`（发布产物必须是单文件 IIFE/打包脚本）。
- **可用全局变量**：
  - `splayer`：宿主注入的交互核心。
  - 标准基础对象：`Buffer`、`URL`、`URLSearchParams`、`TextEncoder`、`TextDecoder`、`btoa`、`atob`、`Promise`、`queueMicrotask`。
  - 定时器：`setTimeout`、`setInterval`、`setImmediate`。
  - `console`（自动转发到 `splayer.log`）。
- **网络请求限制**：网络请求必须通过 `splayer.request(url, options)` 发起，底层通过 Chromium 网络栈代理，仅支持 `http://` 和 `https://`，支持系统与客户端代理配置。

---

## 4. 音源插件协议规范 (Source Plugin Protocol)

### 4.1 脚本头部元数据 (Manifest)
插件脚本头部必须以 JSDoc 块注释声明元数据：

```javascript
/**
 * @name Apple Music 音源插件
 * @id splayer.plugin.applemusic
 * @version 1.0.0
 * @description 为 SPlayer-Next 提供 Apple Music 高品质音源解析与元数据支持
 * @author YourName
 * @type source
 * @apiLevel 2
 */
```

- `@type`：必须声明为 `source`（缺省默认为 `source`）。音源插件自动获得 `network` 权限，无需额外声明 `@grant network`。
- `@apiLevel`：音源插件标准级别为 `2`（若需评论扩展声明 `3`）。

### 4.2 注册源能力 (splayer.register)
在脚本同步执行阶段调用，声明插件支持的源与动作：

```javascript
splayer.register({
  sources: {
    // 对应 SPlayer-Next 中 PLATFORM_TO_PLUGIN_SOURCE["applemusic"] = "am"
    am: {
      name: "Apple Music",
      actions: ["musicUrl"], // 可选包含: ["musicUrl", "musicSearch", "musicLyric", "musicPic"]
      qualities: ["lq", "hq", "lossless", "hi-res"],
    },
  },
});
```

> **注意**：SPlayer-Next 核心代码（`electron/main/plugins/metadata.ts` 及 `src/services/audioSource.ts`）已将 `applemusic` 平台映射为 source key: `am`。因此插件中必须注册 `am` 键。

### 4.3 音频解析处理器 (splayer.on("musicUrl"))
```javascript
splayer.on("musicUrl", async (req) => {
  const { source, quality, musicInfo } = req;
  // source: "am"
  // quality: "lq" | "hq" | "lossless" | "hi-res"
  // musicInfo: { id, songmid, songId, name, singer, interval, albumName, ... }

  // 1. 调用解析逻辑换取真实可播放 URL
  const result = await resolveAppleMusicStream(musicInfo, quality);

  // 2. 返回结果规范：
  // 必须返回非空 url，可选提供 quality 和 expire 时间戳（毫秒）
  return {
    url: result.url,
    quality: result.quality || quality,
    expire: result.expire, // 播放链接有效期（如有）
  };
});
```

- **解析失败行为**：如果解析失败、找不到歌曲或无有效音源，必须 `throw new Error(...)`。SPlayer-Next 捕获到错误后会自动切换到下一个可用插件或报错。

---

## 5. Apple Music 音源技术考量与实现路径

1. **官方机制**：
   - Apple Music 官方音频受 FairPlay DRM 保护，官方 Web API 不直接对外提供无保护音频直链。
2. **可能的技术实现路线**：
   - **路线 A（解析服务/代理中继）**：对接外部专有的 Apple Music 代理流解密服务或公开解析 API（通过 `splayer.request` 调度）。
   - **路线 B（ISRC / 跨平台特征智能匹配）**：通过 Apple Music 歌曲的 ISRC 编号、歌曲名、歌手、时长，智能聚合匹配无损音源库，保证音频质量与时长严密对齐。
3. **性能与稳定性纪律**：
   - **超时控制**：单次解析网络请求建议控制在 5 秒以内，避免造成切歌假死。
   - **负缓存（Negative Caching）**：对于确定不存在或解析失败的曲目，通过 `splayer.storage` 记录短期黑名单缓存，防止频繁重复请求造成雪崩。

---

## 6. 后续开发规划与目录指引

```
e:/applemusic/
├── AGENTS.md         # 本规范与背景文档
├── .gitignore        # Git 忽略配置
├── package.json      # 项目工程配置（TypeScript/打包工具）
├── src/              # 插件源代码（可分模块开发）
│   ├── index.ts      # 插件入口
│   ├── parser.ts     # 解析核心逻辑
│   └── types.ts      # 内部类型定义
└── dist/             # 打包构建产物（单个 .js 插件文件，可直接导入 SPlayer-Next）
```

- **调试安装方法**：
  - 构建出 `.js` 文件后，在 SPlayer-Next 界面中：**设置 → 插件管理 → 本地导入** 选择该 `.js` 文件。
  - 或者直接放置于宿主数据目录：`%APPDATA%\SPlayer-Next\app-data\plugins\scripts\<pluginId>.js`。
