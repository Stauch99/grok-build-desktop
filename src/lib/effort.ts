export type Effort = "low" | "medium" | "high" | "xhigh";

export const DEFAULT_EFFORT: Effort = "medium";

export const EFFORT_OPTIONS: { id: Effort; label: string; hint: string }[] = [
  { id: "low", label: "快速", hint: "更快、更省" },
  { id: "medium", label: "标准", hint: "默认" },
  { id: "high", label: "深入", hint: "多想一会儿" },
  { id: "xhigh", label: "最强", hint: "尽量想透" },
];

export function normalizeEffort(value: string | null | undefined): Effort {
  if (value === "low" || value === "medium" || value === "high" || value === "xhigh") return value;
  return DEFAULT_EFFORT;
}

export function effortLabel(effort: Effort | string): string {
  const id = normalizeEffort(typeof effort === "string" ? effort : effort);
  return EFFORT_OPTIONS.find((o) => o.id === id)?.label ?? "标准";
}

export function nextEffort(effort: Effort): Effort {
  const i = EFFORT_OPTIONS.findIndex((o) => o.id === effort);
  const next = EFFORT_OPTIONS[(i + 1) % EFFORT_OPTIONS.length];
  return next?.id ?? DEFAULT_EFFORT;
}
