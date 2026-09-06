export function Skeleton({
  label,
  rows = 3,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div className="skeleton-stack" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ ["--i" as string]: String(i) }} />
      ))}
    </div>
  );
}
