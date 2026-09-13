import { tr } from "./i18n-bridge";

export type StateAuthorityKind = "desktop-preferences" | "cli-defaults" | "session-runtime";
export type StateAuthority = { kind: StateAuthorityKind; location: "webui.json" | "config.toml" | "ACP/session files" };

const DESKTOP_KEYS = new Set(["saveWebuiState", "projects", "theme", "mode", "chatWidth", "titles", "inboxCwd", "chatFontSize", "pinned", "archived", "drafts", "enterSends", "autoArchiveDays", "filePanelOpen", "steerByDefault", "unread", "sidebarWidth", "previewWidth", "locale", "themeFamily", "accentId", "hideToTray", "defaultRail", "shortcuts", "lastWorkspace", "pinnedProjects", "projectGroups", "sessionTokens", "sidebarList", "manualProjects"]);
const CLI_KEYS = new Set(["patchCliSettings", "model", "effort", "showThinking", "showThinkingDefault", "compactPercent", "memory", "telemetry", "permissionMode", "yolo", "mcp"]);
const SESSION_KEYS = new Set(["pendingPermission", "sessionUpdates", "sessionUsage", "plan", "messages", "toolCalls", "runStatus"]);

export function authorityForState(key: string): StateAuthority {
  if (DESKTOP_KEYS.has(key)) return { kind: "desktop-preferences", location: "webui.json" };
  if (CLI_KEYS.has(key)) return { kind: "cli-defaults", location: "config.toml" };
  if (SESSION_KEYS.has(key)) return { kind: "session-runtime", location: "ACP/session files" };
  throw new Error(`Unknown persisted state key: ${key}`);
}

export function stateAuthorityExplanation(key: string): string {
  const authority = authorityForState(key);
  if (authority.kind === "desktop-preferences") return tr("authority.desktop", { location: authority.location });
  if (authority.kind === "cli-defaults") return tr("authority.cli", { location: authority.location });
  return tr("authority.session", { location: authority.location });
}

export function normalizeShowThinking(input: { cli: boolean | null | undefined; legacyDesktop?: boolean }): boolean {
  return typeof input.cli === "boolean" ? input.cli : true;
}
