import { describe, expect, it } from "vitest";
import { authorityForState, normalizeShowThinking, stateAuthorityExplanation } from "./state-authority";

describe("state authority", () => {
  it.each([
    ["theme", "desktop-preferences", "webui.json"],
    ["defaultRail", "desktop-preferences", "webui.json"],
    ["model", "cli-defaults", "config.toml"],
    ["showThinking", "cli-defaults", "config.toml"],
    ["permissionMode", "cli-defaults", "config.toml"],
    ["pendingPermission", "session-runtime", "ACP/session files"],
    ["sessionUpdates", "session-runtime", "ACP/session files"],
    ["patchCliSettings", "cli-defaults", "config.toml"],
    ["saveWebuiState", "desktop-preferences", "webui.json"],
    ["lastWorkspace", "desktop-preferences", "webui.json"],
    ["pinnedProjects", "desktop-preferences", "webui.json"],
    ["sessionTokens", "desktop-preferences", "webui.json"],
    ["sidebarList", "desktop-preferences", "webui.json"],
  ] as const)("classifies %s under %s", (key, kind, location) => {
    expect(authorityForState(key)).toEqual({ kind, location });
  });

  it("ignores the legacy desktop value when CLI state is available", () => {
    expect(normalizeShowThinking({ cli: false, legacyDesktop: true })).toBe(false);
    expect(normalizeShowThinking({ cli: true, legacyDesktop: false })).toBe(true);
  });

  it("explains CLI-backed settings without implying desktop preference storage", () => {
    expect(stateAuthorityExplanation("permissionMode")).toContain("config.toml");
  });
});
