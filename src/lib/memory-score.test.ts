import { describe, expect, it } from "vitest";
import type { DailyLine } from "./memory-ingest";
import { passesDeepGates, scoreCandidate, shouldKeepExisting } from "./memory-score";

function line(agentId: DailyLine["agentId"], sessionId: string, cwd: string): DailyLine {
  return { agentId, sessionId, cwd, kind: "user_utterance", text: "prefers vitest" };
}

describe("scoreCandidate", () => {
  it("raises frequency and diversity across agents", () => {
    const c = scoreCandidate("prefers vitest", [
      line("grok", "s1", "/a"),
      line("claude", "s2", "/b"),
      line("kimi", "s3", "/c"),
    ], 0.9);
    expect(c.sessionIds).toHaveLength(3);
    expect(c.pairs).toHaveLength(3);
    expect(passesDeepGates(c)).toBe(true);
  });

  it("fails a single-session fact", () => {
    expect(passesDeepGates(scoreCandidate("x", [line("grok", "s1", "/a")], 0.9))).toBe(false);
  });
});

describe("shouldKeepExisting", () => {
  it("keeps the old line when a new one contradicts it", () => {
    expect(shouldKeepExisting("prefers tabs", "prefers spaces")).toBe(true);
    expect(shouldKeepExisting("prefers tabs", "prefers tabs in Rust")).toBe(false);
  });
});
