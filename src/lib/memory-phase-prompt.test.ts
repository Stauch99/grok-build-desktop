import { describe, expect, it } from "vitest";
import { emptyMemoryState } from "./memory-state";
import { phasePrompt } from "./memory-phase-prompt";
import type { DreamIo } from "./memory-dream";

const io: DreamIo = {
  userMd: "# You\n- likes tests Source: grok · s1\n",
  dreamsMd: "## 2026-08-29\nold\n",
  dailyMd: "# 2026-08-30\n- [grok | s1 | /p | user_utterance] hi\n",
  state: emptyMemoryState(),
};

describe("phasePrompt", () => {
  it("asks Light for a replacement daily file body", () => {
    const text = phasePrompt("light", io);
    expect(text).toMatch(/daily/i);
    expect(text).toMatch(/2026-08-30/);
    expect(text).toMatch(/\[agent \| session \| cwd \| kind\]/);
    expect(text).not.toMatch(/USER\.md/);
  });

  it("asks REM for one diary appendix and forbids USER.md", () => {
    const text = phasePrompt("rem", io);
    expect(text).toMatch(/## 2026-08-30/);
    expect(text).toMatch(/USER\.md/);
    expect(text).toMatch(/do not|don't|forbid|不得|不要|禁止/i);
  });

  it("asks Deep for a full USER.md with Source: and 8KiB", () => {
    const text = phasePrompt("deep", io);
    expect(text).toMatch(/USER\.md/);
    expect(text).toMatch(/Source:/);
    expect(text).toMatch(/8\s*KiB/i);
    expect(text).toMatch(/keep existing USER\.md lines on conflict/i);
    expect(text).not.toMatch(/unless they are wrong/);
    expect(text).not.toMatch(/DREAMS\.md/);
  });
});
