/** Cursor-style in-progress shimmer: a tiny grid of independently twinkling dots. */
const GRID = 4;
const COUNT = GRID * GRID;

/** Stagger durations/delays so dots feel random, not a wave. */
const DURATION = [1.05, 1.35, 1.65, 1.2, 1.5, 1.1, 1.45, 1.25, 1.55, 1.15, 1.4, 1.3, 1.6, 1.08, 1.38, 1.22];
const DELAY = [0.02, 0.41, 0.18, 0.63, 0.09, 0.52, 0.27, 0.71, 0.14, 0.58, 0.33, 0.76, 0.06, 0.49, 0.24, 0.67];

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
      title={title}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      role={ariaLabel ? "status" : undefined}
    >
      {Array.from({ length: COUNT }, (_, i) => (
        <span
          key={i}
          className="dot-matrix-cell"
          style={{
            animationDuration: `${DURATION[i]}s`,
            animationDelay: `${DELAY[i]}s`,
          }}
        />
      ))}
    </span>
  );
}
