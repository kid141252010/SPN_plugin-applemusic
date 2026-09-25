/**
 * SPlayer-Next 插件系统与 am-hook 接口类型定义
 */

/** SPlayer-Next 音质等级 (与宿主 QualityLevel 保持一致) */
export type PluginQuality = "hi-res" | "lossless" | "hq" | "sq" | "lq";

/** 宿主传入的曲目元数据 (对齐 SPlayer-Next 官方规范) */
export interface MusicInfo {
  id?: string;
  songmid: string;
  songId?: string;
  name?: string;
  singer?: string;
  source?: string;
  interval?: string | null;
  img?: string | null;
  albumId?: string;
  albumName?: string;
  /** Apple Music 商店地区代码（如 cn / us / tr 等），由宿主透传 */
  storefront?: string;
  meta?: {
    songId?: string;
    albumName?: string;
    albumId?: string;
    picUrl?: string | null;
    isrc?: string;
    storefront?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** musicUrl 请求载荷 */
export interface MusicUrlReq {
  source: string;
  quality: PluginQuality;
  musicInfo: MusicInfo;
}

/** musicUrl 返回结果 */
export interface MusicUrlRes {
  url: string;
  quality?: PluginQuality;
  expire?: number;
}

/** am-hook 解析变体信息 */
export interface AmVariant {
  audio?: string;
  bandwidth: number;
  bit_depth: number | null;
  sample_rate: number | null;
  channels: string | null;
  codecs: string;
  file_uri: string;
  uri: string;
  group_id: string;
}

/** am-hook /parse/:adamId 响应结构 */
export interface AmParseResponse {
  adamId: string;
  hook: boolean;
  masterUrl: string;
  variants: AmVariant[];
  msg?: string;
}

/** 插件配置项定义 */
export interface PluginSettingItem {
  key: string;
  type: "switch" | "number" | "text" | "select";
  label: string;
  description?: string;
  default: boolean | number | string;
  min?: number;
  max?: number;
  placeholder?: string;
  options?: { label: string; value: string }[];
}

/** splayer.register 参数 */
export interface RegisterArgs {
  sources?: Record<
    string,
    {
      name: string;
      actions: string[];
      qualities?: PluginQuality[];
    }
  >;
  settings?: PluginSettingItem[];
  [key: string]: unknown;
}

/** 宿主注入的 splayer 全局对象 */
export interface SPlayerHost {
  pluginId: string;
  apiLevel: number;
  request: (
    url: string,
    options?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string | Uint8Array;
      timeout?: number;
      signal?: AbortSignal;
    },
  ) => Promise<{
    statusCode: number;
    headers: Record<string, string>;
    body: string | Uint8Array;
  }>;
  register: (args: RegisterArgs) => void;
  on: (action: "musicUrl", handler: (req: MusicUrlReq) => Promise<MusicUrlRes>) => void;
  getSetting: <T = unknown>(key: string) => T | undefined;
  onSettingChange: (key: string, handler: (value: unknown) => void) => void;
  storage: {
    get: <T = unknown>(key: string) => Promise<T | null>;
    set: (key: string, value: unknown) => Promise<void>;
    remove: (key: string) => Promise<void>;
  };
  log: {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

declare global {
  const splayer: SPlayerHost;
}
