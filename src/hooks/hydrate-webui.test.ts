import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { SessionSummary, WebuiState } from "../api";
import { splitLeaf, singlePane, MAIN_PANE } from "../lib/pane-tree";
import { hydrateWebuiState, type HydrateWebuiDeps } from "./hydrate-webui";
import { loadWebuiState, listSessions } from "../api";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

vi.mock("../api", () => ({
  loadWebuiState: vi.fn().mockResolvedValue({}),
  readCliSettings: vi.fn().mockResolvedValue(null),
  listSessions: vi.fn().mockResolvedValue([]),
  ensureInbox: vi.fn().mockResolvedValue("/inbox"),
  pathIsDir: vi.fn().mockResolvedValue(true),
  doctor: vi.fn().mockResolvedValue({}),
}));

vi.mock("../lib/workbench-api", () => ({
  doctorAll: vi.fn().mockResolvedValue([]),
  importAgentsMcpFirstOpen: vi.fn().mockResolvedValue([]),
  ensureMemoryMcp: vi.fn().mockResolvedValue(undefined),
}));

function makeDeps(over: Partial<HydrateWebuiDeps> = {}): HydrateWebuiDeps {
  return {
    persist: vi.fn(),
    showToast: vi.fn(),
    applySessionUnion: vi.fn(),
    refreshInspect: vi.fn().mockResolvedValue(undefined),
    hydrateReview: vi.fn(),
    agentPickedRef: { current: false },
    selectedAgentIdLiveRef: { current: "grok" },
    setSelectedAgentId: vi.fn(),
    setDoctors: vi.fn(),
    setInfo: vi.fn(),
    setCli: vi.fn(),
    setShowThinking: vi.fn(),
    setMode: vi.fn(),
    setProjects: vi.fn(),
    setManualProjects: vi.fn(),
    setTheme: vi.fn(),
    setChatWidth: vi.fn(),
    setChatFontSize: vi.fn(),
    setTitles: vi.fn(),
    setPinned: vi.fn(),
    setArchived: vi.fn(),
    setSessionDrafts: vi.fn(),
    setEnterSends: vi.fn(),
    setAutoArchiveDays: vi.fn(),
    setSteerByDefault: vi.fn(),
    setInjectUserMemory: vi.fn(),
    setDreamingEnabled: vi.fn(),
    setDreamAgentId: vi.fn(),
    setDreamThresholdSessions: vi.fn(),
    setMemoryMcpEnabled: vi.fn(),
    setMemoryDisplayName: vi.fn(),
    setLocale: vi.fn(),
    setThemeFamily: vi.fn(),
    setAccentId: vi.fn(),
    setDensity: vi.fn(),
    setHideToTray: vi.fn(),
    setDefaultRail: vi.fn(),
    setShortcuts: vi.fn(),
    setUnread: vi.fn(),
    setSounds: vi.fn(),
    setAllowedTools: vi.fn(),
    setSidebarWidth: vi.fn(),
    setPreviewWidth: vi.fn(),
    setSidebarList: vi.fn(),
    setLastWorkspace: vi.fn(),
    setPinnedProjects: vi.fn(),
    setProjectGroups: vi.fn(),
    setInboxCwd: vi.fn(),
    setSessionTokens: vi.fn(),
    setCwd: vi.fn(),
    setSettingsHydrated: vi.fn(),
    setPaneTree: vi.fn(),
    restorePaneSessions: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

function session(id: string): SessionSummary {
  return {
    id,
    cwd: "/proj",
    title: id,
    updatedAt: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    numMessages: 1,
  };
}

describe("hydrate-webui", () => {
  it("paints local webui.json before sessions and doctor, then hydrates them in the background", () => {
    const src = readFileSync(join(root, "src/hooks/hydrate-webui.ts"), "utf8");
    const paint = src.indexOf("d.setSettingsHydrated(true)");
    const sessions = src.indexOf("listSessions(null)");
    const doctor = src.indexOf("void doctor()");
    expect(paint).toBeGreaterThan(0);
    expect(sessions).toBeGreaterThan(paint);
    expect(doctor).toBeGreaterThan(paint);
    expect(src).toMatch(/refreshInspect\([\s\S]*?\)\.catch/);
  });

  it("paints a persisted pane tree immediately, then restores sessions after listSessions", async () => {
    const tree = splitLeaf(singlePane(), MAIN_PANE, "right", "p2")!;
    const state: WebuiState = {
      paneTree: JSON.parse(JSON.stringify(tree)),
      paneBindings: { main: "a", p2: "b", ghost: "c" },
    };
    vi.mocked(loadWebuiState).mockResolvedValueOnce(state);
    vi.mocked(listSessions).mockResolvedValueOnce([session("a"), session("b")]);

    const calls: string[] = [];
    const deps = makeDeps({
      setPaneTree: vi.fn(() => calls.push("tree")),
      setSettingsHydrated: vi.fn(() => calls.push("hydrated")),
      restorePaneSessions: vi.fn(async () => {
        calls.push("restore");
      }),
    });
    await hydrateWebuiState(deps);

    expect(deps.setPaneTree).toHaveBeenCalledWith(tree);
    expect(calls.indexOf("tree")).toBeLessThan(calls.indexOf("hydrated"));
    await vi.waitFor(() => expect(calls).toContain("restore"));
    expect(deps.restorePaneSessions).toHaveBeenCalledWith(
      tree,
      { main: "a", p2: "b" },
      [expect.objectContaining({ id: "a" }), expect.objectContaining({ id: "b" })],
    );
  });

  it("ignores corrupt persisted pane state entirely", async () => {
    vi.mocked(loadWebuiState).mockResolvedValueOnce({
      paneTree: { type: "wat", id: "x" } as never,
      paneBindings: { main: "a" },
    });
    vi.mocked(listSessions).mockResolvedValueOnce([session("a")]);
    const deps = makeDeps();
    await hydrateWebuiState(deps);
    expect(deps.setPaneTree).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(deps.applySessionUnion).toHaveBeenCalled());
    expect(deps.restorePaneSessions).not.toHaveBeenCalled();
  });
});
