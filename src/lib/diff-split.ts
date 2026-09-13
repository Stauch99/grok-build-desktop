/**
 * Side-by-side projection of the unified diff rows produced by `diff.ts`.
 *
 * `splitRows` zips each run of deletions with the additions that follow it so a
 * changed line shows old-on-the-left / new-on-the-right. Surplus rows on either
 * side pair with an "empty" placeholder cell, keeping the two halves aligned.
 * Context lines render on both sides; collapsed gaps pass through untouched.
 *
 * The view-mode pref lives in localStorage (per-window chrome, not webui.json),
 * reusing the null-safe storage helpers from `sidebar-local`.
 */
import type { DiffRow } from "./diff";
import { storageGet, storageSet } from "./sidebar-local";

export type DiffViewMode = "unified" | "split";

export const DIFF_VIEW_KEY = "grok.diff.view";

export function loadDiffViewMode(raw: unknown): DiffViewMode {
  return raw === "split" ? "split" : "unified";
}

/** Persisted diff view, defaulting to the classic unified layout. */
export function readDiffViewMode(): DiffViewMode {
  return loadDiffViewMode(storageGet(DIFF_VIEW_KEY));
}

export function writeDiffViewMode(mode: DiffViewMode): void {
  storageSet(DIFF_VIEW_KEY, mode);
}

export type SplitCell = {
  text: string;
  /** 1-based line number on this side; undefined for placeholder cells. */
  line?: number;
  tone: "ctx" | "add" | "del" | "empty";
};

export type SplitRow =
  | { kind: "gap"; count: number }
  | { kind: "line"; left: SplitCell; right: SplitCell };

const EMPTY: SplitCell = { text: "", tone: "empty" };

/** Pair deletions and additions into old|new rows for a split diff. */
export function splitRows(rows: DiffRow[]): SplitRow[] {
  const out: SplitRow[] = [];
  let dels: Extract<DiffRow, { kind: "del" }>[] = [];
  let adds: Extract<DiffRow, { kind: "add" }>[] = [];

  const flush = () => {
    const n = Math.max(dels.length, adds.length);
    for (let i = 0; i < n; i++) {
      const d = dels[i];
      const a = adds[i];
      out.push({
        kind: "line",
        left: d ? { text: d.text, line: d.oldLine, tone: "del" } : { ...EMPTY },
        right: a ? { text: a.text, line: a.newLine, tone: "add" } : { ...EMPTY },
      });
    }
    dels = [];
    adds = [];
  };

  for (const row of rows) {
    if (row.kind === "del") {
      dels.push(row);
      continue;
    }
    if (row.kind === "add") {
      adds.push(row);
      continue;
    }
    flush();
    if (row.kind === "gap") {
      out.push({ kind: "gap", count: row.count });
    } else {
      out.push({
        kind: "line",
        left: { text: row.text, line: row.oldLine, tone: "ctx" },
        right: { text: row.text, line: row.newLine, tone: "ctx" },
      });
    }
  }
  flush();
  return out;
}
