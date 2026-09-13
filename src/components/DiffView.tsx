import { useEffect, useMemo, useState } from "react";
import { diffLines, rowMark } from "../lib/diff";
import {
  readDiffViewMode,
  splitRows,
  writeDiffViewMode,
  type DiffViewMode,
  type SplitCell,
} from "../lib/diff-split";
import { pushComposerDraft } from "../lib/composer-inbox";
import { basename } from "../lib/text";
import {
  IconAsk,
  IconCheck,
  IconClose,
  IconColumns,
  IconCopy,
  IconFinder,
  IconList,
  IconMaximize,
  IconMinimize,
} from "../icons";
import { useT } from "../lib/locale-context";

export type DiffViewProps = {
  path: string;
  oldText?: string | null;
  newText?: string;
  /** Reveal the file in Finder / the default editor. */
  onOpen?: (path: string) => void;
};

/**
 * Line-level diff for a tool call's file edit.
 *
 * Increase and decrease carry a `+` / `−` glyph as well as a background tint,
 * so the diff stays readable without color. Untouched stretches collapse to a
 * clickable row rather than scrolling the interesting part off screen. The
 * header toggle switches between the classic unified layout and a side-by-side
 * split (persisted under `grok.diff.view`); either way, hovering a line offers
 * an "ask the agent" affordance that quotes it into the composer.
 */
export function DiffView({ path, oldText, newText, onOpen }: DiffViewProps) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [view, setView] = useState<DiffViewMode>(() => readDiffViewMode());
  const result = useMemo(
    () => diffLines(oldText, newText ?? "", { context: expanded ? 999 : 3 }),
    [oldText, newText, expanded],
  );
  const split = useMemo(
    () => (view === "split" ? splitRows(result.rows) : null),
    [view, result.rows],
  );

  useEffect(() => {
    if (copyState === "idle") return;
    const id = window.setTimeout(() => setCopyState("idle"), 1200);
    return () => window.clearTimeout(id);
  }, [copyState]);

  const created = oldText === null || oldText === undefined;

  const copyNew = () => {
    void navigator.clipboard.writeText(newText ?? "").then(
      () => setCopyState("copied"),
      () => setCopyState("failed"),
    );
  };

  const pickView = (mode: DiffViewMode) => {
    setView(mode);
    writeDiffViewMode(mode);
  };

  /** Quote one real diff line into the composer for the agent to look at. */
  const askAbout = (line: number, text: string) => {
    pushComposerDraft(`> ${path}:${line}\n> ${text}\n\n`);
  };

  /** Hover affordance; only renders on lines that carry real text. */
  const askButton = (line: number | undefined, text: string) =>
    line !== undefined && text !== "" ? (
      <button
        type="button"
        className="diff-ask"
        aria-label={t("diff.askAbout")}
        data-tip={t("diff.askAbout")}
        onClick={() => askAbout(line, text)}
      >
        <IconAsk size={12} />
      </button>
    ) : null;

  const splitHalf = (cell: SplitCell, side: "old" | "new") => (
    <div className={`diff-half ${cell.tone}`} key={side}>
      <span className="diff-ln">{cell.line ?? ""}</span>
      <span className="diff-text">{cell.text || " "}</span>
      {askButton(cell.line, cell.text)}
    </div>
  );

  return (
    <div className="diff">
      <div className="diff-head">
        <span className="diff-path">
          {basename(path) || path}
        </span>
        <span className="diff-stat">
          {result.added > 0 && <span className="stat-add">+{result.added}</span>}
          {result.removed > 0 && <span className="stat-del">−{result.removed}</span>}
          {created && <span className="diff-tag">{t("diff.new")}</span>}
        </span>
        <span className="diff-actions">
          <span className="diff-view" role="group" aria-label={t("diff.viewMode")}>
            <button
              type="button"
              className="file-open"
              aria-pressed={view === "unified"}
              aria-label={t("diff.viewUnified")}
              data-tip={t("diff.viewUnified")}
              onClick={() => pickView("unified")}
            >
              <IconList size={14} />
            </button>
            <button
              type="button"
              className="file-open"
              aria-pressed={view === "split"}
              aria-label={t("diff.viewSplit")}
              data-tip={t("diff.viewSplit")}
              onClick={() => pickView("split")}
            >
              <IconColumns size={14} />
            </button>
          </span>
          {result.rows.some((r) => r.kind === "gap") || expanded ? (
            <button
              type="button"
              className="file-open"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? t("diff.collapse") : t("diff.expand")}
            >
              {expanded ? <IconMinimize size={14} /> : <IconMaximize size={14} />}
            </button>
          ) : null}
          <button
            type="button"
            className="file-open"
            aria-label={
              copyState === "copied"
                ? t("toast.copied")
                : copyState === "failed"
                  ? t("hub.health.failed")
                  : t("diff.copyNew")
            }
            onClick={copyNew}
          >
            {copyState === "copied" ? (
              <IconCheck size={14} />
            ) : copyState === "failed" ? (
              <IconClose size={14} />
            ) : (
              <IconCopy size={14} />
            )}
          </button>
          {onOpen && path ? (
            <button
              type="button"
              className="file-open"
              aria-label={t("finder.open")}
              onClick={() => onOpen(path)}
            >
              <IconFinder size={14} />
            </button>
          ) : null}
        </span>
      </div>

      <div className="diff-body">
        {split
          ? split.map((row, i) => {
              if (row.kind === "gap") {
                return (
                  <button
                    key={`gap-${i}`}
                    type="button"
                    className="diff-gap"
                    onClick={() => setExpanded(true)}
                  >
                    {t("diff.unchanged", { n: row.count })}
                  </button>
                );
              }
              return (
                <div className="diff-split-row" key={`split-${i}`}>
                  {splitHalf(row.left, "old")}
                  {splitHalf(row.right, "new")}
                </div>
              );
            })
          : result.rows.map((row, i) => {
              if (row.kind === "gap") {
                return (
                  <button
                    key={`gap-${i}`}
                    type="button"
                    className="diff-gap"
                    onClick={() => setExpanded(true)}
                  >
                    {t("diff.unchanged", { n: row.count })}
                  </button>
                );
              }
              return (
                <div className={`diff-row ${row.kind}`} key={`${row.kind}-${i}`}>
                  <span className="diff-ln old">{row.kind === "add" ? "" : row.oldLine}</span>
                  <span className="diff-ln new">{row.kind === "del" ? "" : row.newLine}</span>
                  <span className="diff-mark" aria-hidden>
                    {rowMark(row.kind)}
                  </span>
                  <span className="diff-text">{row.text || " "}</span>
                  {askButton(row.kind === "del" ? row.oldLine : row.newLine, row.text)}
                </div>
              );
            })}
        {result.truncated && (
          <div className="diff-more">{t("diff.tooLarge", { n: result.rows.length })}</div>
        )}
      </div>
    </div>
  );
}
