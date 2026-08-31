import { describe, expect, it } from "vitest";
import { permissionModeHint, permissionTimeoutNotice } from "./permission-copy";

describe("permission copy", () => {
  it("explains ask / always-approve / auto", () => {
    expect(permissionModeHint("ask")).toContain("每次");
    expect(permissionModeHint("always-approve")).toContain("不再逐条");
    expect(permissionModeHint("auto")).toContain("permission.toml");
  });

  it("has a visible timeout notice that does not auto-reject", () => {
    const notice = permissionTimeoutNotice();
    expect(notice).toContain("仍在等待");
    expect(notice).toContain("不会自动拒绝");
    expect(notice).not.toContain("已自动拒绝");
  });

  it("says ask mode will not auto-reject on timeout", () => {
    const hint = permissionModeHint("ask");
    expect(hint).toContain("每次");
    expect(hint).toContain("不会因超时自动拒绝");
    expect(hint).not.toContain("超时未选会自动拒绝");
  });
});
