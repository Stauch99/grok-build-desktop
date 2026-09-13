import { describe, expect, it } from "vitest";
import type { AcpRecord } from "./acp-events";
import type { DreamAcpHandle } from "./memory-dream-acp";
import { emptyMemoryState } from "./memory-state";
import { foundingEpisodePath, skillProposalPath } from "./memory-paths";
import { runFoundingDream, type FoundingRunInput } from "./memory-founding-run";
import type { DreamIo } from "./memory-dream";

const now = 1_725_000_000_000;
const day = "2026-09-09";
const memoryRoot = "/mem";

const fourMarker = `<<<DIARY>>>
## 大梦 · ${day}
你当时把「保录」改成了院校录取结果兜底。
<<<USER>>>
# You
- prefers pnpm Source: grok · s1
<<<SKILLS>>>
action: create
id: pnpm-first
title: pnpm first
target:
evidence: grok · s1
summary: default to pnpm
---
action: noop
id: existing
title: keep
target:
evidence: still holds
summary: ok
<<<TAGLINE>>>
会记住纠正的工作台
`;

function io(patch?: Partial<DreamIo>): DreamIo {
  return {
    userMd: `# You
- 继续
- 都动
- likes tests
`,
    dreamsMd: "",
    dailyMd: "",
    state: emptyMemoryState(),
    ...patch,
  };
}

function userChunk(text: string): AcpRecord {
  return { update: { sessionUpdate: "user_message_chunk", content: { text } } };
}

function assistantChunk(text: string): AcpRecord {
  return { update: { sessionUpdate: "agent_message_chunk", content: { text } } };
}

function handle(promptImpl: (text: string) => Promise<string>): DreamAcpHandle {
  return {
    sessionId: "dream-1",
    prompt: promptImpl,
    close: async () => undefined,
  };
}

function base(over: Partial<FoundingRunInput> = {}): FoundingRunInput {
  const input: FoundingRunInput = {
    io: io(),
    memoryRoot,
    selectedAgentId: "grok",
    doctors: [{ agentId: "kimi", authPresent: true }],
    skillNames: ["beldore-pdf"],
    now,
    day,
    grokSkillsRoot: "/home/.grok/skills",
    listPages: async () => [],
    openAcp: async () => handle(async () => fourMarker),
    persistState: async () => ({ stateJson: "{}" }),
    persistDreamFiles: async () => undefined,
    writeText: async () => undefined,
    readKimiCatalog: async () => ["kimi-code/k3", "k3-256k"],
    ...over,
  };
  return input;
}

describe("runFoundingDream gates", () => {
  it("refuses when the dream lock is held", async () => {
    const r = await runFoundingDream(
      base({
        io: io({ state: { ...emptyMemoryState(), lockOwner: "dream" } }),
        listPages: async () => {
          throw new Error("should not list");
        },
      }),
    );
    expect(r.error).toBe("lock");
    expect(r.io.state.foundingStatus).not.toBe("ok");
  });

  it("returns kimi-login when Kimi is signed out", async () => {
    const r = await runFoundingDream(
      base({
        doctors: [{ agentId: "kimi", authPresent: false }],
        listPages: async () => {
          throw new Error("should not list");
        },
      }),
    );
    expect(r.error).toBe("kimi-login");
  });

  it("returns k3 when pickFoundingKimiModel finds no 1M row", async () => {
    const r = await runFoundingDream(
      base({
        readKimiCatalog: async () => ["k3-256k", "kimi-for-coding"],
        listPages: async () => {
          throw new Error("should not list");
        },
      }),
    );
    expect(r.error).toBe("k3");
  });
});

describe("runFoundingDream one-shot", () => {
  it("prompts with founding markers and persists USER/DREAMS plus a pending skill", async () => {
    const prompts: string[] = [];
    const writes = new Map<string, string>();
    const persisted = { userMd: "", dreamsMd: "" };
    let closed = false;

    const r = await runFoundingDream(
      base({
        listPages: async () => [
          {
            sessionId: "s1",
            cwd: "/proj/grok_build_desktop",
            nextByte: 99,
            agentId: "grok",
            rows: [
              assistantChunk("保录服务，总价 32 万。"),
              userChunk("「保录」必须改成「院校录取结果兜底服务」，报价不能加总。"),
            ],
          },
        ],
        openAcp: async (opts) => {
          expect(opts.agentId).toBe("kimi");
          expect(opts.promptTimeoutMs).toBe(45 * 60 * 1000);
          return {
            sessionId: "dream-1",
            prompt: async (text) => {
              prompts.push(text);
              return fourMarker;
            },
            close: async () => {
              closed = true;
            },
          };
        },
        writeText: async (path, text) => {
          writes.set(path, text);
        },
        persistDreamFiles: async (input) => {
          persisted.userMd = input.userMd;
          persisted.dreamsMd = input.dreamsMd;
        },
      }),
    );

    expect(r.error).toBeUndefined();
    expect(closed).toBe(true);
    expect(prompts[0]).toBe("/model kimi-code/k3");
    expect(prompts[1]).toBe("/effort max");
    expect(prompts[2]).toMatch(/<<<DIARY>>>/);
    expect(prompts[2]).toMatch(/## 大梦 · 2026-09-09/);
    expect(prompts[2]).toMatch(/兜底/);
    expect(writes.get(foundingEpisodePath(memoryRoot, 1))).toMatch(/teach_episode/);
    expect(writes.get(skillProposalPath(memoryRoot, "pnpm-first"))).toMatch(/status: pending/);
    expect(writes.get(skillProposalPath(memoryRoot, "existing"))).toBeUndefined();
    expect(persisted.userMd).toContain("prefers pnpm");
    expect(persisted.dreamsMd).toContain("大梦");
    expect(r.io.state.foundingAt).toBe(now);
    expect(r.io.state.foundingStatus).toBe("ok");
    expect(r.io.state.foundingModelId).toBe("kimi-code/k3");
    expect(r.io.state.lockOwner).toBe(null);
    expect(r.io.state.lastStatus).toBe("ok");
    expect(r.io.state.foundingCursors["grok/s1"]).toBe(99);
    expect(r.io.state.cursors).toEqual({});
  });

  it("still finishes when memory-host writes are rejected", async () => {
    const r = await runFoundingDream(
      base({
        listPages: async () => [
          {
            sessionId: "s1",
            cwd: "/proj/grok_build_desktop",
            nextByte: 2,
            agentId: "grok",
            rows: [userChunk("以后先出框架")],
          },
        ],
        writeText: async () => {
          throw new Error("caller workspace does not match trusted workspace");
        },
      }),
    );
    expect(r.error).toBeUndefined();
    expect(r.io.state.foundingStatus).toBe("ok");
  });
});
