import { describe, expect, it } from "vitest";
import {
  allowForSession,
  allowKey,
  findAlwaysOption,
  isAllowOption,
  parseToolName,
  pickAllowOption,
  shouldSkipPermission,
} from "./permission-allow";

describe("parseToolName", () => {
  it("prefers toolKind when present", () => {
    expect(parseToolName("Bash: ls -la", "execute")).toBe("execute");
    expect(parseToolName("Read file", "read")).toBe("read");
  });

  it("falls back to first token of title", () => {
    expect(parseToolName("Bash: ls -la")).toBe("Bash:");
    expect(parseToolName("  Read  path/to/file  ")).toBe("Read");
  });

  it("ignores blank toolKind", () => {
    expect(parseToolName("Write out.ts", "  ")).toBe("Write");
  });
});

describe("allowlist", () => {
  it("builds session::tool keys", () => {
    expect(allowKey("abc", "read")).toBe("abc::read");
  });

  it("shouldSkipPermission is false without session or name", () => {
    const set = new Set<string>(["s1::read"]);
    expect(shouldSkipPermission(set, null, "read")).toBe(false);
    expect(shouldSkipPermission(set, undefined, "read")).toBe(false);
    expect(shouldSkipPermission(set, "s1", "")).toBe(false);
  });

  it("allowForSession records and shouldSkipPermission reads", () => {
    const next = allowForSession(new Set(), "s1", "bash");
    expect(next.has("s1::bash")).toBe(true);
    expect(shouldSkipPermission(next, "s1", "bash")).toBe(true);
    expect(shouldSkipPermission(next, "s1", "read")).toBe(false);
    expect(shouldSkipPermission(next, "s2", "bash")).toBe(false);
  });

  it("does not mutate the original set", () => {
    const base = new Set<string>(["s1::read"]);
    const next = allowForSession(base, "s1", "write");
    expect(base.has("s1::write")).toBe(false);
    expect(next.has("s1::write")).toBe(true);
    expect(next.has("s1::read")).toBe(true);
  });
});

describe("findAlwaysOption", () => {
  it("matches always / 总是 / session in name or kind (case insensitive)", () => {
    expect(
      findAlwaysOption([
        { optionId: "a", name: "Allow once", kind: "allow_once" },
        { optionId: "b", name: "Always allow", kind: "allow_always" },
      ]),
    ).toBe("b");

    expect(
      findAlwaysOption([
        { optionId: "x", name: "拒绝", kind: "reject" },
        { optionId: "y", name: "本次会话总是允许", kind: "allow" },
      ]),
    ).toBe("y");

    expect(
      findAlwaysOption([{ optionId: "s", name: "Allow for session", kind: "allow_session" }]),
    ).toBe("s");

    expect(
      findAlwaysOption([{ optionId: "k", name: "OK", kind: "ALLOW_ALWAYS" }]),
    ).toBe("k");
  });

  it("returns null when nothing matches", () => {
    expect(
      findAlwaysOption([
        { optionId: "a", name: "Allow", kind: "allow_once" },
        { optionId: "r", name: "Reject", kind: "reject" },
      ]),
    ).toBeNull();
  });
});

describe("pickAllowOption", () => {
  it("picks first allow-like option, skips reject/deny/cancel", () => {
    expect(
      pickAllowOption([
        { optionId: "r", name: "Reject", kind: "reject" },
        { optionId: "a", name: "Allow", kind: "allow_once" },
        { optionId: "aa", name: "Always", kind: "allow_always" },
      ]),
    ).toBe("a");

    expect(
      pickAllowOption([
        { optionId: "c", name: "Cancel", kind: "cancel" },
        { optionId: "d", name: "Deny", kind: "deny" },
        { optionId: "ok", name: "允许", kind: "allow" },
      ]),
    ).toBe("ok");
  });

  it("returns null when no allow option", () => {
    expect(
      pickAllowOption([
        { optionId: "r", name: "拒绝", kind: "reject" },
        { optionId: "c", name: "取消", kind: "cancel" },
      ]),
    ).toBeNull();
  });
});

describe("isAllowOption", () => {
  it("flags allow kinds for primary styling", () => {
    expect(isAllowOption({ optionId: "1", name: "Allow", kind: "allow_once" })).toBe(true);
    expect(isAllowOption({ optionId: "2", name: "Reject", kind: "reject" })).toBe(false);
  });
});
