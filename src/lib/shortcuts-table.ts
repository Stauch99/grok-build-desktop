export type ShortcutRow = {
  id: string;
  action: string;
  defaultBinding: string;
};

export const DEFAULT_SHORTCUTS: ShortcutRow[] = [
  { id: "palette", action: "命令面板", defaultBinding: "Mod+K" },
  { id: "new-chat", action: "新对话", defaultBinding: "Mod+N" },
  { id: "settings", action: "设置", defaultBinding: "Mod+," },
  { id: "hub", action: "扩展中心", defaultBinding: "Mod+L" },
  { id: "focus-composer", action: "聚焦输入", defaultBinding: "Mod+J" },
  { id: "review", action: "Dashboard", defaultBinding: "Mod+." },
  { id: "close-pane", action: "关闭窗格", defaultBinding: "Mod+W" },
  { id: "cancel", action: "取消本轮", defaultBinding: "Escape" },
  { id: "mode", action: "切换模式", defaultBinding: "Shift+Tab" },
];

export function bindingFor(
  overrides: Record<string, string> | undefined,
  id: string,
): string {
  return overrides?.[id] || DEFAULT_SHORTCUTS.find((r) => r.id === id)?.defaultBinding || "";
}

export function parseBinding(spec: string): { mod: boolean; shift: boolean; key: string } {
  const parts = spec.split("+").map((p) => p.trim());
  const key = (parts.pop() || "").toLowerCase();
  const flags = new Set(parts.map((p) => p.toLowerCase()));
  return {
    mod: flags.has("mod") || flags.has("meta") || flags.has("ctrl") || flags.has("cmd"),
    shift: flags.has("shift"),
    key,
  };
}

export function matchBinding(
  spec: string,
  e: { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean },
): boolean {
  const b = parseBinding(spec);
  const mod = e.metaKey || e.ctrlKey;
  if (b.mod !== mod) return false;
  if (b.shift !== e.shiftKey) return false;
  return e.key.toLowerCase() === b.key || e.key === b.key;
}

export function showsModHint(spec: string): boolean {
  return parseBinding(spec).mod;
}

function formatKey(key: string): string {
  if (key === "escape") return "Esc";
  if (key === "tab") return "Tab";
  if (key === "enter") return "↩";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/** Compact chord for overlays: `⌘K` on macOS, `Ctrl+K` elsewhere. */
export function formatBinding(spec: string, mac = true): string {
  const b = parseBinding(spec);
  const key = formatKey(b.key);
  if (mac) {
    return `${b.mod ? "⌘" : ""}${b.shift ? "⇧" : ""}${key}`;
  }
  const parts: string[] = [];
  if (b.mod) parts.push("Ctrl");
  if (b.shift) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}
