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
      newSessionCount: 1,
      dreamAgentId: "grok",
      loggedIn: [],
      io: io(),
      runPhase: async () => ({}),
    });
    expect(r.started).toBe(false);
    expect(r.io.state.lastStatus).toBe("blocked-login");
  });

  it("runs three phases and commits a sourced USER.md", async () => {
    const runPhase: PhaseRunner = async (phase) => {
      if (phase === "light") return { dailyMd: "# 2026-08-30\n- [grok | s1 | /p | user_utterance] hi\n" };
      if (phase === "rem") return { dreamsMd: "## 2026-08-30\nhello\n" };
      return { userMd: "# You\n- likes tests\n- prefers dark mode Source: grok · s1\n" };
    };
    const r = await runDreamSweep({
      trigger: "manual",
      enabled: true,
      now: 50,
      newSessionCount: 1,
      dreamAgentId: "grok",
      loggedIn,
      io: io(),
      runPhase,
    });
    expect(r.started).toBe(true);
    expect(r.io.state.lastStatus).toBe("ok");
    expect(r.io.state.lockOwner).toBe(null);
    expect(r.io.userMd.includes("prefers dark mode")).toBe(true);
  });

  it("rolls back USER.md and notes 未晋升", async () => {
    const r = await runDreamSweep({
      trigger: "manual",
      enabled: true,
      now: 50,
      newSessionCount: 1,
      dreamAgentId: "grok",
      loggedIn,
      io: io(),
      runPhase: async (phase) => {
        if (phase === "deep") return { userMd: "# You\n" };
        return {};
      },
    });
    expect(r.io.userMd).toBe("# You\n- likes tests\n");
    expect(r.io.dreamsMd.includes("未晋升")).toBe(true);
  });
});
