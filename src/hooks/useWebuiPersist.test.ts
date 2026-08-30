import { describe, expect, it } from "vitest";
import { DEFAULT_SIDEBAR_LIST } from "../lib/sidebar-list";
import { buildWebuiState, WEBUI_PERSIST_MS, type WebuiSnapshot } from "./useWebuiPersist";

const base: WebuiSnapshot = {
  projects: ["/a"],
  theme: "light",
  mode: "agent",
  chatWidth: 680,
  titles: {},
  inboxCwd: "/inbox",
  chatFontSize: 17,
  pinned: [],
  archived: [],
  drafts: {},
  enterSends: true,
  autoArchiveDays: 0,
  filePanelOpen: false,
  steerByDefault: false,
  unread: {},
  sidebarWidth: 260,
  previewWidth: 360,
  locale: "zh",
  themeFamily: "default",
  density: "comfortable",
  hideToTray: true,
  defaultRail: "changes",
  shortcuts: {},
  lastWorkspace: "",
  pinnedProjects: [],
  sessionTokens: {},
  sidebarList: DEFAULT_SIDEBAR_LIST,
  injectUserMemory: true,
  dreamingEnabled: true,
  dreamAgentId: "grok",
};

describe("buildWebuiState", () => {
  it("copies the snapshot and overlays a partial save", () => {
    expect(buildWebuiState(base, { theme: "dark", titles: { s1: "Hi" } })).toEqual({
      ...base,
      theme: "dark",
      titles: { s1: "Hi" },
    });
  });

  it("keeps filePanelOpen from the snapshot when the partial omits it", () => {
    expect(buildWebuiState({ ...base, filePanelOpen: true }, { unread: { s1: "done" } }).filePanelOpen).toBe(true);
  });

  it("keeps memory settings on the snapshot", () => {
    expect(buildWebuiState({ ...base, injectUserMemory: false, dreamAgentId: "claude" }, {}).dreamAgentId).toBe("claude");
  });
});

describe("webui persist throttle", () => {
  it("debounces writes at 500 ms", () => {
    expect(WEBUI_PERSIST_MS).toBe(500);
  });
});
