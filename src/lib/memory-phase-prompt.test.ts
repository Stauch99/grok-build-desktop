import { describe, expect, it } from "vitest";
import { emptyMemoryState } from "./memory-state";
import { mainPrompt, parseMainOutput } from "./memory-phase-prompt";
import type { DreamIo } from "./memory-dream";

const io: DreamIo = {
  userMd: "# You\n- likes tests Source: grok · s1\n",
  dreamsMd: "## 2026-08-29\nold\n",
  dailyMd: "# 2026-08-30\n- [grok | s1 | /p | user_utterance] hi\n",
  state: emptyMemoryState(),
};

describe("mainPrompt", () => {
  it("produces one prompt asking for all three sections by marker", () => {
    const text = mainPrompt(io, ["- [grok | s1 | /p | user_pref] loves vim"]);
    expect(text).toMatch(/<<<DIARY>>>/);
    expect(text).toMatch(/<<<USER>>>/);
    expect(text).toMatch(/<<<TAGLINE>>>/);
    expect(text).toMatch(/## 2026-08-30/);
    expect(text).toMatch(/loves vim/);
    expect(text).toMatch(/Source:/);
  });
});

describe("parseMainOutput", () => {
  it("parses well-formed three-section output", () => {
    const raw = `
<<<DIARY>>>
## 2026-08-30
The user worked on tests.

<<<USER>>>
# You
- likes tests Source: grok · s1
- loves vim Source: grok · s2

<<<TAGLINE>>>
极简主义的全栈开发者工作台
`;
    const parsed = parseMainOutput(raw);
    expect(parsed.diary).toContain("The user worked on tests.");
    expect(parsed.userMd).toContain("loves vim Source:");
    expect(parsed.tagline).toBe("极简主义的全栈开发者工作台");
  });

  it("handles missing sections gracefully with null fallback", () => {
    const raw = `
<<<USER>>>
# You
- only user
`;
    const parsed = parseMainOutput(raw);
    expect(parsed.diary).toBe(null);
    expect(parsed.userMd).toContain("# You");
    expect(parsed.tagline).toBe(null);
  });

  it("strips code fences if the model wrapped the output", () => {
    const raw = "```markdown\n<<<TAGLINE>>>\nSingle line tagline\n```";
    const parsed = parseMainOutput(raw);
    expect(parsed.tagline).toBe("Single line tagline");
  });
});
