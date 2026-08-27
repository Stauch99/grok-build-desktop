import type { ChatItem } from "./chat";

/**
 * One file operation needed to undo the edits made after a checkpoint.
 * `kind: "delete"` means the agent had no previous content for that path —
 * usually a file it created. That is destructive, so the UI must show it
 * separately and ask before running the plan.
 */
export type RevertStep =
  | { kind: "restore"; path: string; text: string }
  | { kind: "delete"; path: string };

export type RevertPlan = {
  steps: RevertStep[];
  /** Tool calls after the checkpoint that touched files we cannot undo. */
  unknown: string[];
};

/** Index of every user turn, oldest first. These are the checkpoint anchors. */
export function checkpointIndexes(items: ChatItem[]): number[] {
  const out: number[] = [];
  items.forEach((item, i) => {
    if (item.kind === "user") out.push(i);
  });
  return out;
}

/**
 * Build the plan that returns the workspace to its state just before
 * `items[afterIndex]` ran.
 *
 * Walks forward from the checkpoint and keeps the FIRST diff seen per path,
 * because that diff's `oldText` is the content as of the checkpoint. Later
 * edits to the same file are already covered by restoring that content.
 */
export function planRevert(items: ChatItem[], afterIndex: number): RevertPlan {
  const seen = new Set<string>();
  const steps: RevertStep[] = [];
  const unknown: string[] = [];

  for (let i = Math.max(0, afterIndex); i < items.length; i++) {
    const item = items[i];
    if (item.kind !== "tool") continue;
    const diff = item.diff;
    if (!diff) continue;
    const path = diff.path?.trim();
    if (!path) {
      unknown.push(item.title || item.toolKind || "工具调用");
      continue;
    }
    if (seen.has(path)) continue;
    seen.add(path);
    if (typeof diff.oldText === "string") {
      steps.push({ kind: "restore", path, text: diff.oldText });
    } else {
      steps.push({ kind: "delete", path });
    }
  }

  return { steps, unknown };
}

export type RevertPreviewRow = {
  path: string;
  kind: "restore" | "delete";
  /** Last known file contents after the edits being undone. */
  current: string;
  /** Contents after rewind. Empty when the file will be deleted. */
  restored: string;
};

/**
 * Same plan as `planRevert`, plus the last `newText` per path so the dialog
 * can render current → restored without reading the disk.
 */
export function previewRevert(items: ChatItem[], afterIndex: number): RevertPreviewRow[] {
  const plan = planRevert(items, afterIndex);
  const lastNew = new Map<string, string>();
  for (let i = Math.max(0, afterIndex); i < items.length; i++) {
    const item = items[i];
    if (item.kind !== "tool") continue;
    const path = item.diff?.path?.trim();
    if (!path) continue;
    lastNew.set(path, item.diff?.newText ?? "");
  }
  return plan.steps.map((step) => ({
    path: step.path,
    kind: step.kind,
    current: lastNew.get(step.path) ?? "",
    restored: step.kind === "restore" ? step.text : "",
  }));
}

/** Human summary for the confirmation dialog. */
export function describePlan(plan: RevertPlan): string {
  const restore = plan.steps.filter((s) => s.kind === "restore").length;
  const remove = plan.steps.filter((s) => s.kind === "delete").length;
  const parts: string[] = [];
  if (restore) parts.push(`恢复 ${restore} 个文件`);
  if (remove) parts.push(`删除 ${remove} 个新建文件`);
  if (plan.unknown.length) parts.push(`${plan.unknown.length} 处改动无法还原`);
  return parts.join("，") || "没有可还原的文件改动";
}
