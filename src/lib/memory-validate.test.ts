import { describe, expect, it } from "vitest";
import { applyUserMdRewrite, parseUserMdEntries, validateUserMdRewrite } from "./memory-validate";

const prev = `# You
- likes tests
- hates fluff
`;

describe("parseUserMdEntries", () => {
  it("reads bullets", () => {
    expect(parseUserMdEntries(prev)).toEqual(["likes tests", "hates fluff"]);
  });
});

describe("validateUserMdRewrite", () => {
  it("accepts a sourced addition", () => {
    const next = `${prev}- prefers dark mode Source: grok · s1\n`;
    expect(validateUserMdRewrite(prev, next)).toEqual({ ok: true });
  });

  it("rejects loss, missing source, oversize, and shapeless files", () => {
    expect(validateUserMdRewrite(prev, "# You\n- likes tests Source: x\n").ok).toBe(false);
    const source = validateUserMdRewrite(prev, `${prev}- new fact\n`);
    expect(source.ok).toBe(false);
    if (!source.ok) expect(source.reason).toBe("source");
    const shape = validateUserMdRewrite("", "no heading");
    expect(shape.ok).toBe(false);
    if (!shape.ok) expect(shape.reason).toBe("shape");
    const budget = validateUserMdRewrite("", `# You\n- ${"x".repeat(9000)} Source: a\n`);
    expect(budget.ok).toBe(false);
    if (!budget.ok) expect(budget.reason).toBe("budget");
  });

  it("skipLoss allows replacing a short USER.md on first founding", () => {
    const three = `# You
- 继续
- 都动
- likes tests
`;
    const next = "# You\n- prefers pnpm Source: grok · s1\n";
    const blocked = validateUserMdRewrite(three, next);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("loss");
    expect(validateUserMdRewrite(three, next, { skipLoss: true })).toEqual({ ok: true });
  });
});

describe("applyUserMdRewrite", () => {
  it("rolls back to prev when invalid", () => {
    const r = applyUserMdRewrite(prev, "# You\n");
    expect(r.file).toBe(prev);
    expect(r.preimage).toBe(prev);
    expect("rejected" in r && r.rejected).toBe(true);
  });

  it("skipLoss commits a first-founding replacement that would trip 20% loss", () => {
    const three = `# You
- 继续
- 都动
- likes tests
`;
    const next = "# You\n- prefers pnpm Source: grok · s1\n";
    const blocked = applyUserMdRewrite(three, next);
    expect(blocked.rejected).toBe(true);
    expect(blocked.file).toBe(three);
    const r = applyUserMdRewrite(three, next, { skipLoss: true });
    expect(r.rejected).toBeUndefined();
    expect(r.file).toBe(next);
  });
});
