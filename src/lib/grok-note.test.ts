import { describe, expect, it } from "vitest";
import { grokCliNote } from "./grok-note";

describe("grokCliNote", () => {
  it("is silent on success", () => {
    expect(grokCliNote({ code: 0, stdout: "ok", stderr: "" })).toBeNull();
  });

  it("maps trust / missing / duplicate", () => {
    expect(grokCliNote({ code: 1, stdout: "", stderr: "folder is not trusted" })).toMatch(/信任/);
    expect(grokCliNote({ code: 1, stdout: "", stderr: "ENOENT: no such file" })).toMatch(/不存在/);
    expect(grokCliNote({ code: 1, stdout: "already exists", stderr: "" })).toMatch(/同名/);
  });

  it("falls back without dumping the log", () => {
    const note = grokCliNote({ code: 2, stdout: "", stderr: "panic: stack at mcp.rs:90" });
    expect(note).toMatch(/命令日志/);
    expect(note).not.toMatch(/panic/);
  });
});
