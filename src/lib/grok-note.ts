import type { GrokRunResult } from "../api";
import { tr } from "./i18n-bridge";

/**
 * One-line what-happened + how-to-fix. Raw CLI text stays in the command log.
 */
export function grokCliNote(r: GrokRunResult): string | null {
  if (!r.code || r.code === 0) return null;
  const raw = `${r.stderr} ${r.stdout}`.toLowerCase();
  if (/not trusted|untrusted|trust this/.test(raw)) return tr("groknote.untrusted");
  if (/already exists|duplicate/.test(raw)) return tr("groknote.duplicate");
  if (/enoent|not found|no such file|command not found/.test(raw)) return tr("groknote.notFound");
  if (/eacces|permission denied/.test(raw)) return tr("groknote.noPerm");
  if (/auth|login|unauthorized|not logged/.test(raw)) return tr("groknote.auth");
  return tr("groknote.fail");
}
