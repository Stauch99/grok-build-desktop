import { describe, expect, it } from "vitest";
import { emptyMemoryState } from "./memory-state";
import { runDreamSweep, type PhaseRunner } from "./memory-dream";

const loggedIn = ["grok"] as const;

function io() {
  return {
    userMd: "# You\n- likes tests\n",
    dreamsMd: "",
    dailyMd: "",
    state: emptyMemoryState(),
  };
}

describe("runDreamSweep", () => {
  it("does not start when the dream agent is logged out", async () => {
    const r = await runDreamSweep({
      trigger: "manual",
      enabled: true,
      now: 10,
      pendingMaterial: 1,
      thresholdSessions: 8,
      dreamAgentId: "grok",
      loggedIn: [],
      io: io(),
      runPhase: async () => ({}),
    });
    expect(r.started).toBe(false);
    expect(r.io.state.lastStatus).toBe("blocked-login");
  });

  it("runs gather then main and commits USER.md + tagline", async () => {
    const runPhase: PhaseRunner = async (phase) => {
      if (phase === "gather") {
        return { dailyMd: "# 2026-08-30\n- [grok | s1 | /p | user_pref] loves vim\n" };
      }
      return {
        dreamsMd: "## 2026-08-30\nhello\n",
        userMd: "# You\n- likes tests\n- loves vim Source: grok · s1\n",
        tagline: "专为 Rust 打造的工作台",
      };
    };
    const r = await runDreamSweep({
      trigger: "manual",
      enabled: true,
      now: 50,
      pendingMaterial: 1,
      thresholdSessions: 8,
      dreamAgentId: "grok",
      loggedIn,
      io: io(),
      runPhase,
    });
    expect(r.started).toBe(true);
    expect(r.io.state.lastStatus).toBe("ok");
    expect(r.io.state.lockOwner).toBe(null);
    expect(r.io.userMd.includes("loves vim")).toBe(true);
    expect(r.io.state.tagline).toBe("专为 Rust 打造的工作台");
    expect(r.io.state.taglineAt).toBe(50);
    expect(r.io.state.pendingSinceDeep).toEqual({ sessions: 0, mcpBatches: 0 });
    expect(r.io.state.dailySeenDay).toBe("2026-08-30");
  });

  it("rolls back USER.md and notes 未晋升 when rewrite is rejected", async () => {
    const r = await runDreamSweep({
      trigger: "manual",
      enabled: true,
      now: 50,
      pendingMaterial: 1,
      thresholdSessions: 8,
      dreamAgentId: "grok",
      loggedIn,
      io: io(),
      runPhase: async (phase) => {
        if (phase === "main") return { userMd: "# You\n" };
        return {};
      },
    });
    expect(r.io.userMd).toBe("# You\n- likes tests\n");
    expect(r.io.dreamsMd.includes("未晋升")).toBe(true);
  });
});
