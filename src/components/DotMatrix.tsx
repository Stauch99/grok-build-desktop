/** Drive pixel-grid: 3×3 square cells, chevron wavefront running right. */
const CHEVRON_DELAYS_MS = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3);
  const c = i % 3;
  return (c + Math.abs(r - 1)) * 90;
});

export function DotMatrix({
  className,
  "aria-label": ariaLabel,
}: {
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <span
      className={`dot-matrix${className ? ` ${className}` : ""}`}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      role={ariaLabel ? "status" : undefined}
    >
      {CHEVRON_DELAYS_MS.map((delay, index) => (
        <span key={index} className="dot-matrix-cell" style={{ ["--d" as string]: `${delay}ms` }} />
      ))}
    </span>
  );
}
