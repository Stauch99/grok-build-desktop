import { describe, expect, it } from "vitest";
import type { DailyLine } from "./memory-ingest";
import {
  hasMemorySignal,
  recencyFactor,
  selectDreamInput,
  weightDailyLines,
  DREAM_INPUT_MAX_CHARS,
} from "./memory-weight";

function line(agentId: "grok" | "kimi", sessionId: string, kind: DailyLine["kind"], text: string): DailyLine {
  return { agentId, sessionId, cwd: "/project", kind, text };
}

describe("hasMemorySignal", () => {
  it("detects explicit memory requests in Chinese and English", () => {
    expect(hasMemorySignal("请记住我喜欢用 pnpm")).toBe(true);
    expect(hasMemorySignal("以后总是先跑测试")).toBe(true);
    expect(hasMemorySignal("不要格式化 markdown")).toBe(true);
    expect(hasMemorySignal("always use typescript strict mode")).toBe(true);
    expect(hasMemorySignal("remember my preferred editor is vim")).toBe(true);
    expect(hasMemorySignal("today the weather is nice")).toBe(false);
  });
});

describe("weightDailyLines", () => {
  it("ranks user_pref higher than utterance and boosts explicit signals", () => {
    const today = "2026-09-08";
    const lines = [
      line("grok", "s1", "user_utterance", "hello"),
      line("grok", "s1", "user_pref", "use pnpm"),
      line("grok", "s1", "user_pref", "记住我喜欢 pnpm"),
    ];
    const scored = weightDailyLines(lines, today, today);
    expect(scored[1].score).toBeGreaterThan(scored[0].score);
    expect(scored[2].score).toBeGreaterThan(scored[1].score);
  });

  it("boosts lines that repeat across distinct sessions", () => {
    const today = "2026-09-08";
    const lines = [
      line("grok", "s1", "user_pref", "likes rust"),
      line("grok", "s2", "user_pref", "likes rust"),
      line("grok", "s3", "user_pref", "rare note"),
    ];
    const scored = weightDailyLines(lines, today, today);
    expect(scored[0].score).toBeGreaterThan(scored[2].score);
  });

  it("applies recency factor favoring today over yesterday over earlier days", () => {
    expect(recencyFactor("2026-09-08", "2026-09-08")).toBe(1.2);
    expect(recencyFactor("2026-09-07", "2026-09-08")).toBe(1.0);
    expect(recencyFactor("2026-09-01", "2026-09-08")).toBe(0.8);
  });

  it("ranks teach_episode above user_pref", () => {
    const today = "2026-09-09";
    const scored = weightDailyLines(
      [
        line("grok", "s1", "user_pref", "都动"),
        line("grok", "s1", "teach_episode", "was: 保录 → now: 兜底"),
      ],
      today,
      today,
    );
    expect(scored[1].score).toBeGreaterThan(scored[0].score);
  });
});

describe("selectDreamInput", () => {
  it("respects the line and character budget and formats tagged lines", () => {
    const today = "2026-09-08";
    const lines: DailyLine[] = [];
    for (let i = 0; i < 60; i++) {
      lines.push(line("grok", `s${i}`, "user_pref", `Rule ${i}: keep tests green`));
    }
    const result = selectDreamInput([{ lines, day: today }], today, { maxLines: 10 });
    expect(result.selected.length).toBe(10);
    expect(result.dropped).toBe(50);
    expect(result.selected[0]).toMatch(/^- \[grok \| s\d+ \| \/project \| user_pref\] Rule/);
    expect(result.inputChars).toBeLessThanOrEqual(DREAM_INPUT_MAX_CHARS);
  });

  it("handles empty daily gracefully", () => {
    const result = selectDreamInput([], "2026-09-08");
    expect(result.selected).toEqual([]);
    expect(result.dropped).toBe(0);
    expect(result.inputChars).toBe(0);
  });
});
