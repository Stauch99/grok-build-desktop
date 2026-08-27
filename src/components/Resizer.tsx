import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from "react";

export type ResizerProps = {
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  /** Called once when a drag ends, so callers persist a width instead of 200 of them. */
  onCommit?: (next: number) => void;
  /** Double-click resets to this width. */
  resetTo?: number;
  /** 1 when dragging right widens the column, -1 when it narrows it. */
  direction?: 1 | -1;
  className?: string;
};

const STEP = 16;
const BIG_STEP = 64;

/**
 * Draggable column divider. Also a real separator for keyboard users —
 * arrows nudge, Shift jumps, Home/End go to the bounds — because a
 * mouse-only resize is the kind of thing that quietly excludes people.
 */
export function Resizer({
  ariaLabel,
  value,
  min,
  max,
  onChange,
  onCommit,
  resetTo,
  direction = 1,
  className,
}: ResizerProps) {
  const startX = useRef(0);
  const startValue = useRef(0);
  const latest = useRef(value);
  latest.current = value;

  const clamp = useCallback((n: number) => Math.min(max, Math.max(min, Math.round(n))), [min, max]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    startX.current = e.clientX;
    startValue.current = value;
    document.documentElement.classList.add("resizing");
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const delta = (e.clientX - startX.current) * direction;
    onChange(clamp(startValue.current + delta));
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.documentElement.classList.remove("resizing");
    onCommit?.(latest.current);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? BIG_STEP : STEP;
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = value - step * direction;
    else if (e.key === "ArrowRight") next = value + step * direction;
    else if (e.key === "Home") next = min;
    else if (e.key === "End") next = max;
    else if (e.key === "Enter" && resetTo !== undefined) next = resetTo;
    if (next === null) return;
    e.preventDefault();
    const clamped = clamp(next);
    onChange(clamped);
    onCommit?.(clamped);
  };

  return (
    <div
      className={`resizer${className ? ` ${className}` : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={() => {
        if (resetTo === undefined) return;
        const next = clamp(resetTo);
        onChange(next);
        onCommit?.(next);
      }}
    >
      <span className="resizer-grip" aria-hidden />
    </div>
  );
}
