import type { GrokRunResult } from "../api";

/**
 * One-line what-happened + how-to-fix. Raw CLI text stays in the command log.
 */
export function grokCliNote(r: GrokRunResult): string | null {
  if (!r.code || r.code === 0) return null;
  const raw = `${r.stderr} ${r.stdout}`.toLowerCase();
  if (/not trusted|untrusted|trust this/.test(raw)) return "此目录未信任。点上方「信任此文件夹」。";
  if (/already exists|duplicate/.test(raw)) return "已经有同名项。换一个名字，或先删掉旧的。";
  if (/enoent|not found|no such file|command not found/.test(raw)) return "命令或路径不存在。检查名称后再试。";
  if (/eacces|permission denied/.test(raw)) return "没有写入权限。检查 ~/.grok 是否可写。";
  if (/auth|login|unauthorized|not logged/.test(raw)) return "未登录。在终端运行 grok login。";
  return "没写上。打开命令日志看细节，或点刷新重试。";
}
