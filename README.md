# SPlayer-Next Apple Music 音源插件 (`splayer.plugin.applemusic`)

专为 **[SPlayer-Next](https://github.com/SPlayer-Dev/SPlayer-Next)** 桌面音乐播放器打造的 **Apple Music 音源解析插件**。  
基于 **[am-hook](https://music.ak1ra.de5.net/)** 解密流中继服务，为播放器提供高品质/无损音频（ALAC）、标准立体声（AAC）以及**杜比全景声（Dolby Atmos / 空间音频）**的完整播放支持。

---

## 特性亮点

- **音质档位严格对齐**：完全遵循 SPlayer-Next 官方音质梯阶规范（`hi-res`、`lossless`、`hq`、`sq`、`lq`），支持 24bit/96kHz+ Hi-Res 无损与 44.1kHz CD 级 ALAC 无损。
- **杜比全景声（Dolby Atmos）高级配置**：内置独立的「优先杜比全景声」配置开关。开启后若曲目提供 `ec-3` 空间音频流，将优先返回 768kbps/448kbps 全景声音轨。
- **透明服务端实时解密流**：通过 am-hook 的 `--hook` 代理机制直接输出未加密的标准音频流，支持 HTTP Range 与断点续传（Seek 拖动无延迟），零沙箱开销。
- **智能 Adam ID 提取**：支持纯数字 ID、带前缀 ID、以及各类 Apple Music Web 歌曲/专辑分享链接自动提取。
- **负缓存雪崩防护**：内置失败短期负缓存机制（10分钟），避免对区域版权受限或已下架曲目发起频繁无效请求导致切歌假死。
- **超时快速失败（Fail-Fast）**：单次请求默认 4.5 秒硬超时，防止网络波动挂起阻塞整条播放流水线。

---

## 插件配置项 (Plugin Settings)

安装后，在 SPlayer-Next 的 **设置 → 插件管理 → Apple Music 音源插件 → 设置** 中即可可视化调整：

| 配置项 (Key) | 类型 | 默认值 | 说明 |
| :--- | :---: | :---: | :--- |
| **优先杜比全景声 (`preferDolbyAtmos`)** | 开关 | `false` | 若曲目包含杜比全景声/空间音频 (`ec-3` 编码) 音轨，优先返回全景声音轨（需硬件/系统多声道设备支持）。 |
| **am-hook 上游服务地址 (`upstreamUrl`)** | 文本 | `https://music.ak1ra.de5.net` | 指定提供音源解析与解密流代理的端点，支持配置用户自建的私有节点。 |
| **解析超时时间 (`requestTimeout`)** | 数字 | `4500` (ms) | 向上游服务发起解析的最大等待时限（建议 3000~6000ms）。 |

---

## 音质档位与 Apple Music 音轨映射规则

| SPlayer-Next 音质档位 | 匹配的 Apple Music 音轨与编解码格式 |
| :--- | :--- |
| **`hi-res` (高解析度无损)** | 优先 24bit / 96kHz+ ALAC；回退到标准 ALAC；若开启杜比全景声优先则直接返回最高码率 Atmos |
| **`lossless` (无损)** | 优先 16/24bit 44.1kHz/48kHz 标准 ALAC 无损；回退到 Hi-Res ALAC 或 AAC 256k |
| **`hq` (高品质)** | 优先 256kbps AAC (`mp4a.40.2` 标准立体声)；回退到 ALAC 或其他 AAC |
| **`sq` (标准音质)** | 约 128kbps AAC (`mp4a.40.2`) |
| **`lq` (低品质)** | 64kbps HE-AAC (`mp4a.40.5`) 或低码率 AAC |

---

## 安装与使用方法

### 方式一：在 SPlayer-Next 界面本地导入
1. 下载或构建产物文件 `dist/splayer.plugin.applemusic.js`。
2. 打开 SPlayer-Next 播放器，进入 **设置 → 插件管理**。
3. 点击 **本地导入**，选择 `splayer.plugin.applemusic.js` 即可启用。

### 方式二：直接放入播放器插件目录
将 `splayer.plugin.applemusic.js` 复制到以下系统目录：
- **Windows**: `%APPDATA%\SPlayer-Next\app-data\plugins\scripts\splayer.plugin.applemusic.js`
- **macOS**: `~/Library/Application Support/SPlayer-Next/app-data/plugins/scripts/splayer.plugin.applemusic.js`
- **Linux**: `~/.config/SPlayer-Next/app-data/plugins/scripts/splayer.plugin.applemusic.js`

---

## 本地开发与构建

```bash
# 1. 安装依赖
pnpm install

# 2. 运行自动化单元测试
pnpm test

# 3. 打包构建插件产物
pnpm run build
```

打包成功后，单文件产物将输出在 `dist/splayer.plugin.applemusic.js`。

---

## 许可证

MIT License
