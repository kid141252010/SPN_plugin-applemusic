/**
 * 解析并清理 upstream 地址与认证凭证
 * 兼容 `https://token@host`、`https://user:pass@host` 格式以及显式配置的 token
 */
export function parsePluginUpstream(
  rawUpstream: string,
  rawToken?: string,
): { upstream: string; token?: string; authHeaders: Record<string, string> } {
  let urlStr = (rawUpstream || "").trim();
  let token = (rawToken || "").trim() || undefined;

  try {
    const u = new URL(urlStr);
    if (u.username) {
      if (u.password) {
        const creds = `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`;
        const authHeaders: Record<string, string> = {
          Authorization: `Basic ${btoa(creds)}`,
        };
        u.username = "";
        u.password = "";
        return {
          upstream: `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`,
          token,
          authHeaders,
        };
      } else {
        if (!token) {
          token = decodeURIComponent(u.username);
        }
        u.username = "";
        urlStr = `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`;
      }
    }
  } catch {
    // 忽略 URL 解析失败
  }

  const upstream = urlStr.replace(/\/+$/, "");
  const authHeaders: Record<string, string> = {};
  if (token) {
    authHeaders.Authorization = `Bearer ${token}`;
  }

  return { upstream, token, authHeaders };
}
