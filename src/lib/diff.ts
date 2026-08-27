export type DiffRow =
  | { kind: "ctx"; text: string; oldLine: number; newLine: number }
  | { kind: "del"; text: string; oldLine: number }
  | { kind: "add"; text: string; newLine: number }
  | { kind: "gap"; count: number };

export type DiffResult = {
  rows: DiffRow[];
  added: number;
  removed: number;
  /** Rows were dropped to keep a huge edit renderable. */
  truncated: boolean;
};

/** Unchanged lines kept on each side of a change. */
const CONTEXT = 3;
/** Above this the collapsed view stops and says how much it hid. */
const MAX_ROWS = 400;
/**
 * LCS is O(n·m). Past this product we stop trying to align lines and just show
 * the whole middle as removed-then-added, which is still readable and never hangs.
 */
const LCS_BUDGET = 250_000;

function splitLines(text: string): string[] {
  if (text === "") return [];
  return text.replace(/\n$/, "").split("\n");
}

/** Longest common subsequence over lines, returned as diff rows. */
function lcsRows(
  oldLines: string[],
  newLines: string[],
  oldStart: number,
  newStart: number,
): DiffRow[] {
  const n = oldLines.length;
  const m = newLines.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        oldLines[i] === newLines[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      rows.push({ kind: "ctx", text: oldLines[i], oldLine: oldStart + i, newLine: newStart + j });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      rows.push({ kind: "del", text: oldLines[i], oldLine: oldStart + i });
      i++;
    } else {
      rows.push({ kind: "add", text: newLines[j], newLine: newStart + j });
      j++;
    }
  }
  while (i < n) {
    rows.push({ kind: "del", text: oldLines[i], oldLine: oldStart + i });
    i++;
  }
  while (j < m) {
    rows.push({ kind: "add", text: newLines[j], newLine: newStart + j });
    j++;
  }
  return rows;
}

/** Replace long runs of unchanged lines with a single gap marker. */
export function collapseContext(rows: DiffRow[], context = CONTEXT): DiffRow[] {
  const keep = new Array(rows.length).fill(false);
  rows.forEach((row, i) => {
    if (row.kind === "ctx") return;
    for (let j = Math.max(0, i - context); j <= Math.min(rows.length - 1, i + context); j++) {
      keep[j] = true;
    }
  });
  const out: DiffRow[] = [];
  let hidden = 0;
  for (let i = 0; i < rows.length; i++) {
    if (keep[i]) {
      if (hidden > 0) {
        out.push({ kind: "gap", count: hidden });
        hidden = 0;
      }
      out.push(rows[i]);
    } else {
      hidden++;
    }
  }
  if (hidden > 0) out.push({ kind: "gap", count: hidden });
  return out;
}

/**
 * Line-level diff with collapsed context.
 *
 * `oldText === null` means the agent created the file, so every line is an
 * addition. Common prefix and suffix are stripped before the expensive part,
 * which is what makes a one-line edit in a large file cheap.
 */
export function diffLines(
  oldText: string | null | undefined,
  newText: string,
  opts: { context?: number; maxRows?: number } = {},
): DiffResult {
  const context = opts.context ?? CONTEXT;
  const maxRows = opts.maxRows ?? MAX_ROWS;
  const newLines = splitLines(newText ?? "");

  if (oldText === null || oldText === undefined) {
    const rows: DiffRow[] = newLines.map((text, i) => ({ kind: "add", text, newLine: i + 1 }));
    const truncated = rows.length > maxRows;
    return {
      rows: truncated ? rows.slice(0, maxRows) : rows,
      added: newLines.length,
      removed: 0,
      truncated,
    };
  }

  const oldLines = splitLines(oldText);

  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const oldMid = oldLines.slice(prefix, oldLines.length - suffix);
  const newMid = newLines.slice(prefix, newLines.length - suffix);

  let middle: DiffRow[];
  if (oldMid.length * newMid.length <= LCS_BUDGET) {
    middle = lcsRows(oldMid, newMid, prefix + 1, prefix + 1);
  } else {
    middle = [
      ...oldMid.map((text, i) => ({ kind: "del" as const, text, oldLine: prefix + 1 + i })),
      ...newMid.map((text, i) => ({ kind: "add" as const, text, newLine: prefix + 1 + i })),
    ];
  }

  const head: DiffRow[] = oldLines.slice(0, prefix).map((text, i) => ({
    kind: "ctx",
    text,
    oldLine: i + 1,
    newLine: i + 1,
  }));
  const tail: DiffRow[] = oldLines.slice(oldLines.length - suffix).map((text, i) => ({
    kind: "ctx",
    text,
    oldLine: oldLines.length - suffix + i + 1,
    newLine: newLines.length - suffix + i + 1,
  }));

  const all = [...head, ...middle, ...tail];
  const added = all.filter((r) => r.kind === "add").length;
  const removed = all.filter((r) => r.kind === "del").length;
  const collapsed = collapseContext(all, context);
  const truncated = collapsed.length > maxRows;

  return {
    rows: truncated ? collapsed.slice(0, maxRows) : collapsed,
    added,
    removed,
    truncated,
  };
}

/** `+` / `−` / ` ` prefix so increase and decrease do not rely on color alone. */
export function rowMark(kind: DiffRow["kind"]): string {
  if (kind === "add") return "+";
  if (kind === "del") return "−";
  return " ";
}
