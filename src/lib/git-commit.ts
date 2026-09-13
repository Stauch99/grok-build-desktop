import { tr } from "./i18n-bridge";

/** Reject empty or whitespace-only commit subjects before calling git. */
export function commitMessageOk(msg: string): boolean {
  return msg.trim().length > 0;
}

/** After a checkout, warn when the open session is bound to another worktree branch. */
export function branchMismatchToast(
  sessionBranch: string | null | undefined,
  nextBranch: string,
): string | null {
  const bound = sessionBranch?.trim() ?? "";
  const next = nextBranch.trim();
  if (!bound || !next || bound === next) return null;
  return tr("git.branchMismatch");
}
