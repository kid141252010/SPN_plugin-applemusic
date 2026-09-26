# AGENTS.md

本文档记录本项目的背景、架构定位、协作流程以及为 SPlayer-Next 开发 Apple Music 音源插件的完整技术规范，供协作智能体与开发者共同遵守。

---

## 1. 项目背景与定位 (Project Overview)

- **项目定位**：本项目是一个专为 **[SPlayer-Next](https://github.com/SPlayer-Dev/SPlayer-Next)** 桌面音乐播放器打造的 **Apple Music 音源插件**（Source Plugin）。
- **核心目标**：
  - 当 SPlayer-Next 播放来自 Apple Music 平台的曲目（`track.source === "applemusic"`，内部映射 source key 为 `am`）时，为播放器解析并返回高品质、可播放的真实音频流/直链 URL（`musicUrl`）。
  - **范围界定**：本项目**仅聚焦音频流取址解析**（`musicUrl`），**不实现歌词获取**（SPlayer-Next 已具备完善的多源逐字歌词检索与 AMLL TTML 管道，歌词解析交由宿主既有流水线处理）。
- **关键参考目录与文档**：
  - **宿主播放器本地源码**：`E:\SPlayer-Next`
  - **官方插件开发文档**：[https://splayer-next.imsyy.top/plugins/](https://splayer-next.imsyy.top/plugins/)
  - **音源插件规范文档**：[https://splayer-next.imsyy.top/plugins/source.html](https://splayer-next.imsyy.top/plugins/source.html)
  - **控制插件与通用 API**：[https://splayer-next.imsyy.top/plugins/control.html](https://splayer-next.imsyy.top/plugins/control.html)
  - **插件市场与更新规范**：[https://splayer-next.imsyy.top/plugins/update.html](https://splayer-next.imsyy.top/plugins/update.html)

## 2. 核心原则与开发纪律 (Core Principles & Mandatory Disciplines)

> [!IMPORTANT]
> **凡事必先查阅规范（Official Specification First）**：
> 任何开发者与 Agent 在进行代码改动、功能开发、接口对接或排查问题前，**严禁马虎臆测、凭空假想或闭门造车**！每次行动必须严格核对：
> 1. **官方插件开发规范文档**：[https://splayer-next.imsyy.top/plugins/](https://splayer-next.imsyy.top/plugins/)（精读总览、[音源插件](https://splayer-next.imsyy.top/plugins/source.html)、[插件更新](https://splayer-next.imsyy.top/plugins/update.html)、[类型参考](https://splayer-next.imsyy.top/types.html)）；
> 2. **宿主播放器本地源码**：`E:\SPlayer-Next\electron\main\plugins`，直接对照 loader 与 runtime 的实际实现。

### 2.1 版本迭代与变更日志规范（严禁马虎，强制执行）
1. **每次改动必更新版本号**：
   - 只要代码有任何功能新增 (`feat`)、缺陷修复 (`fix`)、架构重构 (`refactor`) 或配置调整，**必须严格按 SemVer 递增版本号**（`MAJOR.MINOR.PATCH`），绝对禁止静默改动或发重复版本！
2. **Changelog 严格写在脚本头部元数据（不要建单独的 .md 文件）**：
   - SPlayer-Next 插件更新体系是原生基于脚本头 JSDoc 注释解析的，**不需要、也不要新建单独的 CHANGELOG.md 文档**！
   - 更新日志必须直接写在打包配置 `tsup.config.ts` 的 `banner` 块注释里的 `@changelog` 字段中。
   - 换行统一使用字面量 `\n` 分隔（宿主插件卡片会按 `pre-wrap` 渲染多行）。
3. **版本号双处同步与更新地址声明**：
   - `package.json` 中的 `"version"` 与 `tsup.config.ts` 中的 `@version` 必须保持严格一致。
   - 必须配置 `@updateUrl` 指向 GitHub raw 脚本地址，以便用户和宿主能正常检测新版并一键更新。
4. **产物构建与本地联调**：
   - 改动完成后执行 `pnpm run build`，检查 `dist/1412.applemusic.js` 头部声明是否完整正确。
   - 将最新构建产物同步到 `%APPDATA%\SPlayer-Next\app-data\plugins\scripts\1412.applemusic.js` 进行联调验证。

---

## 3. 仓库管理与协作流程 (Git & Repository Workflow)

1. **改动必提交 (Commit upon Completion)**：
   - 每次完成代码修改、版本更新与产物构建后，**必须及时完成 Git 本地提交**，确保工作区干净，严禁留存未提交的零散修改。
   - 遵循 Conventional Commits 规范，单行中文摘要：`<type>: <summary>`（例如 `feat: 增加本地 WASM 解密流代理支持`，`chore: 发布 v1.1.0`）。
2. **禁止自动推送 (Push on User Instruction Only)**：
   - **智能体严禁私自、主动执行 `git push` 操作**！
   - 每次改动完成后仅在本地完成 commit，**远程推送必须等待用户下达明确指令或由用户亲自手动执行**。

---

## 4. SPlayer-Next 插件架构与沙箱环境 (Host Sandbox)

插件运行在 SPlayer-Next 的独立插件沙箱中，开发者与 Agent 必须严格遵守以下环境约束：

### 4.1 进程与沙箱模型
- **独立进程**：所有启用的插件共享一个独立的 `splayer-plugin-host` Utility 进程，各插件运行在专有的 `node:vm` 沙箱上下文内。
- **崩溃隔离与自愈**：单个插件崩溃由宿主看门狗自愈重载（按 2s → 8s → 30s 退避），不会影响播放器主界面与正在播放的声音。
- **共享单线程事件循环**：所有插件共享同一进程事件循环，**严禁写同步阻塞代码或死循环**。
- **顶层 5 秒时限**：脚本顶层同步执行必须在 5 秒内完成，耗时操作必须进入异步处理器。

### 4.2 运行环境与全局可用对象
- **禁止 Node 模块与原生 API**：没有 `fs`、`net`、`path`、`child_process`，无 `require` / `import`（发布产物必须是单文件 IIFE/打包脚本）。
- **可用全局变量**：
  - `splayer`：宿主注入的交互核心。
  - 标准基础对象：`Buffer`、`URL`、`URLSearchParams`、`TextEncoder`、`TextDecoder`、`btoa`、`atob`、`Promise`、`queueMicrotask`。
  - 定时器：`setTimeout`、`setInterval`、`setImmediate`。
  - `console`（自动转发到 `splayer.log`）。
- **网络请求限制**：网络请求必须通过 `splayer.request(url, options)` 发起，底层通过 Chromium 网络栈代理，仅支持 `http://` 和 `https://`，支持系统与客户端代理配置。

---

## 5. 音源插件协议规范 (Source Plugin Protocol)

### 5.1 脚本头部元数据 (Manifest)
插件脚本头部必须以 JSDoc 块注释声明元数据：

```javascript
/**
 * @name Apple Music 音源
 * @id 1412.applemusic
 * @version 1.1.0
 * @description 基于 am-hook 上游服务为 SPlayer-Next 提供 Apple Music 音频流解析支持（支持 Hi-Res、Lossless 无损及杜比全景声）
 * @author 1412
 * @type source
 * @apiLevel 2
 * @updateUrl https://raw.githubusercontent.com/kid141252010/applemusic/main/dist/1412.applemusic.js
 * @changelog 支持客户端本地 WASM 解密流代理，实现 Apple CDN 直连秒开\n优化 Storefront 地区解析
 */
```

- `@type`：必须声明为 `source`（缺省默认为 `source`）。音源插件自动获得 `network` 权限，无需额外声明 `@grant network`。
- `@apiLevel`：音源插件标准级别为 `2`（若需评论扩展声明 `3`）。
- `@updateUrl`：声明稳定 raw 脚本地址，宿主借此检测更新并提供一键升级。
- `@changelog`：单行内用字面 `\n` 表示换行，宿主卡片按 pre-wrap 渲染更新日志。

### 5.2 注册源能力 (splayer.register)
在脚本同步执行阶段调用，声明插件支持的源与动作：

```javascript
splayer.register({
  sources: {
    // 对应 SPlayer-Next 中 PLATFORM_TO_PLUGIN_SOURCE["applemusic"] = "am"
    am: {
      name: "Apple Music",
      actions: ["musicUrl"], // 专注音源播放流解析
      qualities: ["lq", "hq", "lossless", "hi-res"],
    },
  },
});
```

> **注意**：SPlayer-Next 核心代码（`electron/main/plugins/metadata.ts` 及 `src/services/audioSource.ts`）已将 `applemusic` 平台映射为 source key: `am`。因此插件中必须注册 `am` 键。

### 5.3 音频解析处理器 (splayer.on("musicUrl"))
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

## 6. Apple Music 音源技术考量与实现路径

1. **官方机制**：
   - Apple Music 官方音频受 FairPlay DRM 保护，官方 Web API 不直接对外提供无保护音频直链。
2. **可能的技术实现路线**：
   - **路线 A（解析服务/代理中继）**：对接外部专有的 Apple Music 代理流解密服务或公开解析 API（通过 `splayer.request` 调度）。
   - **路线 B（ISRC / 跨平台特征智能匹配）**：通过 Apple Music 歌曲的 ISRC 编号、歌曲名、歌手、时长，智能聚合匹配无损音源库，保证音频质量与时长严密对齐。
3. **性能与稳定性纪律**：
   - **超时控制**：单次解析网络请求建议控制在 5 秒以内，避免造成切歌假死。
   - **负缓存（Negative Caching）**：对于确定不存在或解析失败的曲目，通过 `splayer.storage` 记录短期黑名单缓存，防止频繁重复请求造成雪崩。

---

## 7. 后续开发规划与目录指引

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
