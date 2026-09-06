/** Cursor-style in-progress shimmer: a tiny grid of independently twinkling dots. */
const GRID = 4;
const COUNT = GRID * GRID;

export function DotMatrix({
  className,
  title,
  "aria-label": ariaLabel,
}: {
  className?: string;
  title?: string;
  "aria-label"?: string;
}) {
  return (
    <span
      className={`dot-matrix${className ? ` ${className}` : ""}`}
      data-tip={title}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      role={ariaLabel ? "status" : undefined}
    >
      {Array.from({ length: COUNT }, (_, i) => (
        <span key={i} className="dot-matrix-cell" style={{ ["--i" as string]: String(i) }} />
      ))}
    </span>
  );
}
