import { t, type Locale } from "./i18n";
import { bridgeLocale } from "./i18n-bridge";

type Rule = { re: RegExp; key: string };

/**
 * Ordered most-specific first: raw Rust/IPC error strings are matched into
 * short, localized copy. The raw text stays available via rawErrorText for
 * tooltips and diagnostics.
 */
const RULES: Rule[] = [
  { re: /stdin 繁忙|stdin busy|channel full/i, key: "err.stdinBusy" },
  { re: /超时|timeout|timed out/i, key: "err.timeout" },
  {
    re: /Authentication required|未登录|登录已过期|认证失败|鉴权失败|unauthorized|invalid api key/i,
    key: "err.auth",
  },
  {
    re: /找不到 grok|无法解析 .* 的启动参数|启动 .* agent 失败|spawn|not installed|未安装/i,
    key: "err.spawnFailed",
  },
  { re: /session not found|会话不存在|no such session/i, key: "err.sessionMissing" },
  {
    re: /path is blocked|不允许|outside the workspace|blocked|permission denied|EACCES|路径不在/i,
    key: "err.pathBlocked",
  },
  { re: /配置太大|too large|content too big/i, key: "err.configTooLarge" },
  {
    re: /不是表|not a table|failed to parse|invalid toml|解析失败/i,
    key: "err.config",
  },
  { re: /not found|找不到|no such file|does not exist|ENOENT/i, key: "err.notFound" },
  { re: /os error|EIO|EPIPE|读写失败|failed to (read|write)/i, key: "err.io" },
  { re: /cancelled|aborted|已取消/i, key: "err.cancelled" },
];

export function rawErrorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err ?? "");
}

/** Localized, human-friendly one-liner for a rejected promise. */
export function friendlyError(err: unknown, locale?: Locale): string {
  const raw = rawErrorText(err).trim();
  const loc = locale ?? bridgeLocale();
  if (!raw) return t(loc, "err.generic", { detail: "" });
  for (const rule of RULES) {
    if (rule.re.test(raw)) return t(loc, rule.key);
  }
  return t(loc, "err.generic", { detail: raw.slice(0, 120) });
}
