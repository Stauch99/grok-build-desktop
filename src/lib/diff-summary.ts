export type DiffSummaryItem = {
  kind: string;
  diff?: { path?: string; oldText?: string | null };
};

export type DiffSummaryCounts = { created: number; modified: number };

function isCreated(oldText?: string | null): boolean {
  return oldText == null || oldText === "";
}

/**
 * Count this-turn file edits. Only `kind === "tool"` items that carry `diff.path`
 * count; a null/empty `oldText` is a create, anything else is a modify.
 */
export function summarizeDiffs(items: DiffSummaryItem[]): DiffSummaryCounts {
  let created = 0;
  let modified = 0;
  for (const item of items) {
    if (item.kind !== "tool") continue;
    if (!item.diff?.path) continue;
    if (isCreated(item.diff.oldText)) created += 1;
    else modified += 1;
  }
  return { created, modified };
}
