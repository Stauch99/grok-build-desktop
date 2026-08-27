import type { CompatCell } from "./inspect";

export type CompatVendor = "claude" | "cursor";
export type CompatSurface = "skills" | "mcps" | "hooks";

export function compatEnabled(cells: CompatCell[] | undefined, vendor: CompatVendor, surface: CompatSurface): boolean {
  const hit = cells?.find((c) => c.vendor === vendor && c.surface === surface);
  return hit ? hit.enabled : true;
}

export function toggleCompat(
  cells: CompatCell[] | undefined,
  vendor: CompatVendor,
  surface: CompatSurface,
  enabled: boolean,
): CompatCell[] {
  const next = [...(cells ?? [])];
  const i = next.findIndex((c) => c.vendor === vendor && c.surface === surface);
  if (i >= 0) next[i] = { ...next[i], enabled, source: "config" };
  else next.push({ vendor, surface, enabled, source: "config" });
  return next;
}
