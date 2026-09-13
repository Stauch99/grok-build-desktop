import { describe, expect, it } from "vitest";
import { extractTeachLines, stripInjectedMemory } from "./memory-teach";
import type { IngestTurn } from "./memory-ingest";

const base = { agentId: "grok" as const, sessionId: "s1", cwd: "/p" };

describe("stripInjectedMemory", () => {
  it("drops a closed user-memory block and keeps the real request", () => {
    const text = `<user-memory>\n# You\n- 继续 Source: grok · s0\n</user-memory>\n\n都动`;
    expect(stripInjectedMemory(text)).toBe("都动");
  });

  it("drops an unclosed user-memory prefix of # You bullets", () => {
    const text = `<user-memory>\n# You\n- 清日历 Source: grok · s0\n请改合同`;
    expect(stripInjectedMemory(text)).toContain("请改合同");
    expect(stripInjectedMemory(text)).not.toContain("清日历");
  });
});

describe("extractTeachLines", () => {
  it("pairs a correction with the previous assistant turn as teach_episode", () => {
    const turns: IngestTurn[] = [
      { ...base, role: "assistant", text: "保录服务，总价 32 万。" },
      { ...base, role: "user", text: "「保录」必须改成「院校录取结果兜底服务」，报价不能加总。" },
    ];
    const lines = extractTeachLines(turns);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.kind).toBe("teach_episode");
    expect(lines[0]?.text).toMatch(/兜底/);
  });

  it("treats 都动 and 继续 as user_pref", () => {
    const lines = extractTeachLines([
      { ...base, role: "user", text: "都动" },
      { ...base, sessionId: "s2", role: "user", text: "继续" },
    ]);
    expect(lines.map((l) => l.kind)).toEqual(["user_pref", "user_pref"]);
  });

  it("drops tools, secrets, forgotten ids, and unsignaled chatter", () => {
    const lines = extractTeachLines(
      [
        { ...base, role: "tool", text: "bash" },
        { ...base, role: "user", text: "hello there today" },
        { ...base, role: "user", text: "sk-abc" },
        { ...base, sessionId: "gone", role: "user", text: "以后用 pnpm" },
      ],
      ["gone"],
    );
    expect(lines).toEqual([]);
  });
});
