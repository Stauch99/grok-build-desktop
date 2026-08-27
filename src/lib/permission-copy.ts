export type PermissionModeId = "ask" | "always-approve" | "auto";

export function permissionModeHint(mode: string): string {
  if (mode === "always-approve") return "不再逐条确认。危险命令仍可能被 hooks / 沙箱拦住。";
  if (mode === "auto") return "由 CLI 按 permission.toml 与风险判断，不一定每次弹卡。";
  return "每次工具调用先问你。超时未选会自动拒绝，并留下可见提示。";
}

export function permissionTimeoutNotice(): string {
  return "许可已超时，已自动拒绝。再发一条即可重试。";
}
