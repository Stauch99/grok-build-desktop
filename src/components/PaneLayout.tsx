import { useRef, type ReactNode } from "react";
import { PANE_MIN, type PaneNode, type SplitDir } from "../lib/pane-tree";

export function PaneLayout({
  tree,
  onRatio,
  renderLeaf,
}: {
  tree: PaneNode;
  onRatio: (splitId: string, ratio: number) => void;
  renderLeaf: (paneId: string) => ReactNode;
}) {
  if (tree.type === "leaf") return <>{renderLeaf(tree.id)}</>;
  return (
    <div className={`pane-split pane-split-${tree.dir}`}>
      <div className="pane-split-branch" style={{ flex: `${tree.ratio} 1 0` }}>
        <PaneLayout tree={tree.first} onRatio={onRatio} renderLeaf={renderLeaf} />
      </div>
      <SplitDivider
        dir={tree.dir}
        ratio={tree.ratio}
        onChange={(next) => onRatio(tree.id, next)}
      />
      <div className="pane-split-branch" style={{ flex: `${1 - tree.ratio} 1 0` }}>
        <PaneLayout tree={tree.second} onRatio={onRatio} renderLeaf={renderLeaf} />
      </div>
    </div>
  );
}

function clampRatio(ratio: number, size: number, dir: SplitDir): number {
  const min = dir === "col" ? PANE_MIN.width / size : PANE_MIN.height / size;
  const floor = Number.isFinite(min) && min > 0 && min < 0.5 ? min : 0.2;
  return Math.min(1 - floor, Math.max(floor, ratio));
}

function SplitDivider({
  dir,
  ratio,
  onChange,
}: {
  dir: SplitDir;
  ratio: number;
  onChange: (ratio: number) => void;
}) {
  const start = useRef({ pos: 0, ratio: 0, size: 1 });
  const axis = dir === "col" ? "x" : "y";
  return (
    <div
      className={`resizer pane-split-resizer ${axis === "y" ? "resizer-row" : ""}`}
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-label={dir === "col" ? "调整左右分屏" : "调整上下分屏"}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const parent = e.currentTarget.parentElement;
        if (!parent) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const rect = parent.getBoundingClientRect();
        start.current = {
          pos: axis === "x" ? e.clientX : e.clientY,
          ratio,
          size: axis === "x" ? rect.width : rect.height,
        };
        document.documentElement.classList.add("resizing");
        if (axis === "y") document.documentElement.classList.add("resizing-row");
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const delta = (axis === "x" ? e.clientX : e.clientY) - start.current.pos;
        onChange(clampRatio(start.current.ratio + delta / Math.max(1, start.current.size), start.current.size, dir));
      }}
      onPointerUp={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        document.documentElement.classList.remove("resizing", "resizing-row");
      }}
      onPointerCancel={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        document.documentElement.classList.remove("resizing", "resizing-row");
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.1 : 0.04;
        const back = axis === "x" ? "ArrowLeft" : "ArrowUp";
        const fwd = axis === "x" ? "ArrowRight" : "ArrowDown";
        if (e.key === back) {
          e.preventDefault();
          onChange(clampRatio(ratio - step, start.current.size || 800, dir));
        } else if (e.key === fwd) {
          e.preventDefault();
          onChange(clampRatio(ratio + step, start.current.size || 800, dir));
        }
      }}
    >
      <span className="resizer-grip" aria-hidden />
    </div>
  );
}
