import type { Rect } from "../lib/pane-tree";

export function PaneDropOverlay({
  title,
  subtitle,
  x,
  y,
  preview,
  allowed,
}: {
  title: string;
  subtitle?: string;
  x: number;
  y: number;
  preview: Rect | null;
  allowed: boolean;
}) {
  return (
    <>
      {preview ? (
        <div
          className={`pane-drop-target${allowed ? "" : " is-blocked"}`}
          style={{
            left: preview.left,
            top: preview.top,
            width: preview.right - preview.left,
            height: preview.bottom - preview.top,
          }}
        />
      ) : null}
      <div className="pane-drop-ghost" style={{ left: x + 12, top: y + 12 }}>
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
    </>
  );
}
