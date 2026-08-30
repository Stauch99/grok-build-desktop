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
    expect(validateUserMdRewrite(prev, `${prev}- new fact\n`).reason).toBe("source");
    expect(validateUserMdRewrite("", "no heading").reason).toBe("shape");
    expect(validateUserMdRewrite("", `# You\n- ${"x".repeat(9000)} Source: a\n`).reason).toBe("budget");
  });
});

describe("applyUserMdRewrite", () => {
  it("rolls back to prev when invalid", () => {
    const r = applyUserMdRewrite(prev, "# You\n");
    expect(r.file).toBe(prev);
    expect(r.preimage).toBe(prev);
    expect("rejected" in r && r.rejected).toBe(true);
  });
});
