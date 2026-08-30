import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { AcpRecord } from "./lib/acp-events";
import type { AgentId } from "./lib/agent-id";
import { acpMessageFromEvent, resolveStartAgentId } from "./lib/acp-host";

export type SessionSummary = {
  id: string;
  cwd: string;
  title: string;
  model?: string | null;
  agentName?: string | null;
  updatedAt: string;
  createdAt: string;
  numMessages: number;
  dir?: string | null;
  sessionKind?: string | null;
  parentSessionId?: string | null;
  agentId?: string | null;
};

export type DoctorInfo = {
  grokPath?: string | null;
  grokVersion?: string | null;
  grokHome: string;
  authPresent: boolean;
};

export type WebuiState = {
  projects?: string[];
  theme?: "light" | "dark";
  model?: string;
  showThinking?: boolean;
  mode?: "agent" | "plan" | "yolo";
  chatWidth?: number;
  titles?: Record<string, string>;
  inboxCwd?: string;
  chatFontSize?: number;
  pinned?: string[];
  archived?: string[];
  drafts?: Record<string, string>;
  enterSends?: boolean;
  autoArchiveDays?: number;
  filePanelOpen?: boolean;
  steerByDefault?: boolean;
  sidebarWidth?: number;
  previewWidth?: number;
  /** sessionId → terminal state you have not looked at yet. */
  unread?: Record<string, "done" | "error">;
  locale?: "zh" | "en";
  themeFamily?: "default" | "paper" | "ink";
  density?: "comfortable" | "compact";
  hideToTray?: boolean;
  defaultRail?: "tasks" | "changes" | "context";
  shortcuts?: Record<string, string>;
  lastWorkspace?: string;
  pinnedProjects?: string[];
  sessionTokens?: Record<string, number>;
  sidebarList?: {
    grouping?: "project" | "updated" | "status";
    ordering?: "updated" | "title";
    showTokens?: boolean;
    showStatus?: boolean;
    showWorktree?: boolean;
    statusFilter?: Array<"needs-you" | "unread" | "working" | "done">;
    includeArchived?: boolean;
  };
  injectUserMemory?: boolean;
  dreamingEnabled?: boolean;
  dreamAgentId?: AgentId;
};

export type WorkspaceEntry = {
  name: string;
  path: string;
  kind: "file" | "dir";
};

export type SessionSearchHit = {
  sessionId: string;
  cwd: string;
  title: string;
  snippet: string;
};

export type GitStatus = {
  isRepo: boolean;
  root: string;
  branch: string;
  dirty: number;
  ahead: number;
  behind: number;
};

export type GitChangeStatus = "modified" | "added" | "deleted" | "renamed" | "untracked";

export type GitChange = {
  path: string;
  abs: string;
  added: number;
  removed: number;
  status: GitChangeStatus;
};

export type InspectBrief = {
  grokVersion?: string;
  cwd?: string;
  projectRoot?: string | null;
  agents?: unknown;
  mcpServers?: unknown;
  skills?: unknown;
  plugins?: unknown;
  hooks?: unknown;
  marketplaces?: unknown;
  lspServers?: unknown;
  externalCompat?: unknown;
  permissions?: unknown;
  projectInstructions?: unknown;
  projectTrusted?: boolean;
};

export type JsonRpc = {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string };
};

export const doctor = () => invoke<DoctorInfo>("doctor");
export const startAgent = (agentId?: AgentId) =>
  invoke<{ ok: boolean; grok?: string; agentId?: string }>("start_agent", {
    agentId: resolveStartAgentId(agentId),
  });
export const setWorkspace = (cwd: string, sessionId?: string | null) =>
  invoke<void>("set_workspace", { cwd, sessionId: sessionId ?? null });
export const stopAgent = (agentId?: AgentId | null) =>
  invoke<void>("stop_agent", { agentId: agentId ?? null });
export const sendRaw = (payload: JsonRpc, agentId?: AgentId) =>
  invoke<void>("send_raw", { payload, agentId: resolveStartAgentId(agentId) });
export const nextRpcId = () => invoke<number>("next_rpc_id");
export const listSessions = (cwd?: string | null) =>
  invoke<SessionSummary[]>("list_sessions", { cwd: cwd ?? null });
export const pickDirectory = () => invoke<string | null>("pick_directory");
export const listProjectFiles = (cwd: string, query?: string) =>
  invoke<string[]>("list_project_files", { cwd, query: query ?? null });
export const listWorkspaceEntries = (cwd: string) =>
  invoke<WorkspaceEntry[]>("list_workspace_entries", { cwd });
export const searchSessionText = (query: string, cwd?: string | null) =>
  invoke<SessionSearchHit[]>("search_session_text", { query, cwd: cwd ?? null });
export type TextFilePreview = { path: string; text: string; truncated: boolean };
export const readTextFile = (path: string, allowRoot?: string | null) =>
  invoke<TextFilePreview>("read_text_file", { path, allowRoot: allowRoot ?? null });
export type MemoryChangeRow = { path: string; mtime: number };
export const listMemoryChanges = () => invoke<MemoryChangeRow[]>("list_memory_changes");

export type MemoryHostSnapshot = {
  userMd: string;
  dreamsMd: string;
  dailyMd: string;
  stateJson: string;
  memoryRoot: string;
};

export type MemoryHostPatch = {
  userMd?: string;
  dreamsMd?: string;
  dailyMd?: string;
  dailyDay?: string;
  stateJson?: string;
};

export const readMemoryHost = () => invoke<MemoryHostSnapshot>("read_memory_host");
export const writeMemoryHost = (patch: MemoryHostPatch) =>
  invoke<void>("write_memory_host", { patch });
export const openPath = (path: string) => invoke<void>("open_path", { path });
export const openReviewPath = (path: string, allowRoot: string) => invoke<void>("open_review_path", { path, allowRoot });
export type SessionUpdates = {
  rows: AcpRecord[];
  nextByte: number;
  truncated: boolean;
};
export const readSessionUpdates = (sessionId: string, afterByte?: number | null) =>
  invoke<SessionUpdates>("read_session_updates", {
    sessionId,
    afterByte: afterByte ?? null,
  });
export type SessionUsage = { used: number; size: number };
export const readSessionUsage = (sessionId: string) =>
  invoke<SessionUsage | null>("read_session_usage", { sessionId });

export type PlanFile = { path: string; text: string; mtime: number };
export const readPlan = (sessionId: string) =>
  invoke<PlanFile | null>("read_plan", { sessionId });

export type RuleScope = "project" | "parent" | "home";
export type RuleFile = {
  path: string;
  name: string;
  dir: string;
  scope: RuleScope | string;
  bytes: number;
};
export const listProjectRules = (cwd: string) =>
  invoke<RuleFile[]>("list_project_rules", { cwd });
export const loadWebuiState = () => invoke<WebuiState>("load_webui_state");
export const saveWebuiState = (state: WebuiState) => invoke<void>("save_webui_state", { state });
export const listProjectRoots = () => invoke<string[]>("list_project_roots");
export const pathIsDir = (path: string) => invoke<boolean>("path_is_dir", { path });
export const deleteSession = (sessionId: string) => invoke<void>("delete_session", { sessionId });
export const ensureInbox = (path?: string | null) =>
  invoke<string>("ensure_inbox", { path: path ?? null });
export const moveSessionToCwd = (sessionId: string, destCwd: string, inboxCwd: string) =>
  invoke<SessionSummary>("move_session_to_cwd", { sessionId, destCwd, inboxCwd });
export type CliSettings = {
  model: string;
  effort: string;
  permissionMode: string;
  yolo: boolean;
  showThinking: boolean;
  telemetry: boolean;
  memory: boolean;
  compactPercent: number;
  mcp: { name: string; enabled: boolean }[];
  configPath: string;
};

export const gitStatus = (cwd: string) => invoke<GitStatus>("git_status", { cwd });
export const gitChanges = (cwd: string) => invoke<GitChange[]>("git_changes", { cwd });
export const gitCreateWorktree = (cwd: string, name: string) =>
  invoke<string>("git_create_worktree", { cwd, name });
/** Rewind primitive: `text === null` deletes the file. */
export const restoreTextFile = (path: string, text: string | null, allowRoot: string) =>
  invoke<void>("restore_text_file", { path, text, allowRoot });
export const setTrayStatus = (text: string) => invoke<void>("set_tray_status", { text });

export const inspectBrief = (cwd?: string | null) =>
  invoke<InspectBrief>("inspect_brief", { cwd: cwd ?? null });
export const readCliSettings = () => invoke<CliSettings>("read_cli_settings");
export const patchCliSettings = (patch: Partial<CliSettings>) =>
  invoke<{ ok: boolean }>("patch_cli_settings", { patch });

export type GrokRunResult = { code: number | null; stdout: string; stderr: string };
export const runGrok = (args: string[], cwd?: string | null) =>
  invoke<GrokRunResult>("run_grok", { args, cwd: cwd ?? null });
export const runGrokStream = (args: string[], cwd?: string | null) =>
  invoke<GrokRunResult>("run_grok_stream", { args, cwd: cwd ?? null });

export type ConfigText = { path: string; text: string; exists: boolean };
export const readConfigText = (scope: "user" | "project", cwd?: string | null) =>
  invoke<ConfigText>("read_config_text", { scope, cwd: cwd ?? null });
export const writeConfigText = (scope: "user" | "project", text: string, cwd?: string | null) =>
  invoke<void>("write_config_text", { scope, text, cwd: cwd ?? null });
export const writeAllowedText = (path: string, text: string, allowRoot?: string | null) =>
  invoke<void>("write_allowed_text", { path, text, allowRoot: allowRoot ?? null });
export const statAttachment = (path: string, allowRoot?: string | null) =>
  invoke<{ path: string; bytes: number; kind: "file" | "dir" }>("stat_attachment", {
    path,
    allowRoot: allowRoot ?? null,
  });

export type GitCommit = { hash: string; subject: string; date: string };
export const gitLog = (cwd: string) => invoke<GitCommit[]>("git_log", { cwd });
export const gitBranches = (cwd: string) => invoke<string[]>("git_branches", { cwd });

export type GitCommandResult = { ok: boolean; code: number; stderr: string };
export const gitCommit = (cwd: string, message: string) =>
  invoke<GitCommandResult>("git_commit", { cwd, message });

export type GitBlame = { ok: boolean; text: string; stderr: string };
export const gitBlame = (cwd: string, path: string, line: number) =>
  invoke<GitBlame>("git_blame", { cwd, path, line });

export const gitStatusUntracked = (cwd: string) =>
  invoke<string[]>("git_status_untracked", { cwd });

export type FileTreeNode = { name: string; path: string; kind: "file" | "dir" };
export const listFileTree = (cwd: string, query?: string) =>
  invoke<FileTreeNode[]>("list_file_tree", { cwd, query: query ?? null });

export const hideWindow = () => invoke<void>("hide_window");
export const setHideOnClose = (hide: boolean) => invoke<void>("set_hide_on_close", { hide });
export const readModelsCache = () => invoke<unknown>("read_models_cache");
export const listModelsText = () => invoke<string>("list_models_text");
export const trustFolder = (cwd: string, trusted = true) =>
  invoke<void>("trust_folder", { cwd, trusted });
export const createSkill = (input: {
  name: string;
  scope: "user" | "project";
  description?: string;
  cwd?: string | null;
  template?: string;
}) => invoke<{ path: string }>("create_skill", { input });
export const patchSkillsDisabled = (names: string[]) =>
  invoke<void>("patch_skills_disabled", { names });
export const patchCompat = (vendor: "claude" | "cursor", surface: string, enabled: boolean) =>
  invoke<void>("patch_compat", { vendor, surface, enabled });
export const listSessionSpills = (sessionId: string) =>
  invoke<string[]>("list_session_spills", { sessionId });
export const listImagineArtifacts = (cwd?: string | null) =>
  invoke<string[]>("list_imagine_artifacts", { cwd: cwd ?? null });
export const openInTerminal = (cwd: string) => invoke<void>("open_in_terminal", { cwd });
export const readManagedConfig = () =>
  invoke<{ path: string; text: string; exists: boolean }>("read_managed_config");
export const setNotifyTarget = (sessionId: string | null) =>
  invoke<void>("set_notify_target", { sessionId });
export const writeHookFile = (scope: "user" | "project", filename: string, text: string, cwd?: string | null) =>
  invoke<{ path: string }>("write_hook_file", { scope, filename, text, cwd: cwd ?? null });
export const listAgentsDir = () =>
  invoke<{ name: string; path: string; kind: "agent" | "persona" }[]>("list_agents_dir");
export const workspaceMtime = (cwd: string) => invoke<number>("workspace_mtime", { cwd });
export const readUsageHistory = () =>
  invoke<{ at: number; used: number; size: number }[]>("read_usage_history");
export type TokenTurnRow = {
  at: number;
  cwd: string;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
  total: number;
  modelCalls: number;
  costTicks: number;
};
export const readTokenTurns = () => invoke<TokenTurnRow[]>("read_token_turns");

export type GrokCliLog = { stream: "stdout" | "stderr"; line: string };
export const onGrokCliLog = (handler: (row: GrokCliLog) => void): Promise<UnlistenFn> =>
  listen<GrokCliLog>("grok-cli-log", (e) => handler(e.payload));
export const onNotifyOpen = (handler: (sessionId: string) => void): Promise<UnlistenFn> =>
  listen<string>("notify-open", (e) => handler(e.payload));
export const onWorkspaceHint = (handler: (cwd: string) => void): Promise<UnlistenFn> =>
  listen<string>("workspace-hint", (e) => handler(e.payload));

let notifyAllowed: boolean | null = null;

/** Ask once, cache the answer. Never throws — notifications are best-effort. */
export async function ensureNotifyPermission(): Promise<boolean> {
  if (notifyAllowed !== null) return notifyAllowed;
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    notifyAllowed = granted;
  } catch {
    notifyAllowed = false;
  }
  return notifyAllowed;
}

export async function notify(title: string, body: string): Promise<void> {
  if (!(await ensureNotifyPermission())) return;
  try {
    sendNotification({ title, body });
  } catch {
    /* best-effort */
  }
}

/** macOS dock badge. `0` clears it. Silently no-ops where unsupported. */
export async function setBadge(count: number): Promise<void> {
  try {
    const win = getCurrentWindow();
    const next = count > 0 ? count : undefined;
    await win.setBadgeCount?.(next);
  } catch {
    /* unsupported platform or missing capability */
  }
}

export async function windowFocused(): Promise<boolean> {
  try {
    return await getCurrentWindow().isFocused();
  } catch {
    return true;
  }
}

export const onWindowFocus = (handler: (focused: boolean) => void): Promise<UnlistenFn> =>
  getCurrentWindow().onFocusChanged(({ payload }) => handler(payload));

export const onAcpMessage = (handler: (msg: JsonRpc) => void): Promise<UnlistenFn> =>
  listen<unknown>("acp-message", (e) => {
    handler(acpMessageFromEvent(e.payload).payload as JsonRpc);
  });
export const onAcpRequest = (handler: (msg: JsonRpc) => void): Promise<UnlistenFn> =>
  listen<unknown>("acp-request", (e) => {
    handler(acpMessageFromEvent(e.payload).payload as JsonRpc);
  });
export const onAcpStderr = (handler: (line: string) => void): Promise<UnlistenFn> =>
  listen<unknown>("acp-stderr", (e) => {
    const raw = e.payload;
    if (typeof raw === "string") {
      handler(raw);
      return;
    }
    const inner = acpMessageFromEvent(raw).payload;
    handler(typeof inner === "string" ? inner : String(inner ?? ""));
  });
export const onAgentExit = (handler: () => void): Promise<UnlistenFn> =>
  listen("agent-exit", () => handler());
export const onTrayOpenLast = (handler: () => void): Promise<UnlistenFn> =>
  listen("tray-open-last", () => handler());

export { doctorAll, installMarketplaceSkill } from "./lib/workbench-api";
