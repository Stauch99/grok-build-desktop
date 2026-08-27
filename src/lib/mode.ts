export type Mode = "agent" | "plan" | "yolo";

export const MODE_OPTIONS: { id: Mode; label: string; hint: string }[] = [
  { id: "agent", label: "Agent", hint: "正常执行，按许可询问" },
  { id: "plan", label: "Plan", hint: "先出方案，改代码前停" },
  { id: "yolo", label: "始终批准", hint: "本轮跳过许可卡" },
];

export function modeLabel(mode: Mode): string {
  if (mode === "plan") return "Plan";
  if (mode === "yolo") return "始终批准";
  return "Agent";
}

export function slashForMode(mode: Mode): "/plan" | "/always-approve" | "/auto" {
  if (mode === "plan") return "/plan";
  if (mode === "yolo") return "/always-approve";
  return "/auto";
}

export function nextMode(mode: Mode): Mode {
  if (mode === "agent") return "plan";
  if (mode === "plan") return "yolo";
  return "agent";
}

/** Full-access mode skips permission cards — confirm before entering it. */
export function modeNeedsConfirm(from: Mode, to: Mode): boolean {
  return to === "yolo" && from !== "yolo";
}
