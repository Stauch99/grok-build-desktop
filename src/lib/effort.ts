import { tr } from "./i18n-bridge";

export type Effort = "low" | "medium" | "high" | "xhigh";

export const DEFAULT_EFFORT: Effort = "medium";

/** `hint` is a getter so callers that read the option directly still get the live locale. */
export const EFFORT_OPTIONS: { id: Effort; label: string; hint: string }[] = [
  { id: "low", label: "Low", get hint() { return tr("effort.hint.low"); } },
  { id: "medium", label: "Medium", get hint() { return tr("effort.hint.medium"); } },
  { id: "high", label: "High", get hint() { return tr("effort.hint.high"); } },
  { id: "xhigh", label: "xHigh", get hint() { return tr("effort.hint.xhigh"); } },
];

const EXTRA_EFFORT: Record<string, { label: string; hint: string }> = {
  max: { label: "Max", get hint() { return tr("effort.hint.max"); } },
  none: { label: "Off", get hint() { return tr("effort.hint.none"); } },
  ultracode: { label: "Ultracode", get hint() { return tr("effort.hint.ultracode"); } },
};

function titleCase(id: string): string {
  if (!id) return "";
  return id.slice(0, 1).toUpperCase() + id.slice(1);
}

export function normalizeEffort(value: string | null | undefined): Effort {
  if (value === "low" || value === "medium" || value === "high" || value === "xhigh") return value;
  return DEFAULT_EFFORT;
}

export function effortLabel(effort: Effort | string): string {
  const id = typeof effort === "string" ? effort : effort;
  const grok = EFFORT_OPTIONS.find((o) => o.id === id);
  if (grok) return grok.label;
  const extra = EXTRA_EFFORT[id];
  if (extra) return extra.label;
  if (!id) return EFFORT_OPTIONS.find((o) => o.id === DEFAULT_EFFORT)?.label ?? "Medium";
  return titleCase(id);
}

export function effortHint(effort: string): string {
  const grok = EFFORT_OPTIONS.find((o) => o.id === effort);
  if (grok) return grok.hint;
  return EXTRA_EFFORT[effort]?.hint ?? "";
}

export function effortMenuOptions(ids: string[]): { id: string; label: string; hint: string }[] {
  return ids.map((id) => ({ id, label: effortLabel(id), hint: effortHint(id) }));
}

export function coerceEffort(value: string | undefined, allowed: string[], fallback?: string): string {
  if (value && allowed.includes(value)) return value;
  if (fallback && allowed.includes(fallback)) return fallback;
  return allowed[0] ?? "";
}

export function nextEffort(effort: Effort): Effort {
  const i = EFFORT_OPTIONS.findIndex((o) => o.id === effort);
  const next = EFFORT_OPTIONS[(i + 1) % EFFORT_OPTIONS.length];
  return next?.id ?? DEFAULT_EFFORT;
}
