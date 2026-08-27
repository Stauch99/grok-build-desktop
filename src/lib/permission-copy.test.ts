import { describe, expect, it } from "vitest";
import { permissionModeHint, permissionTimeoutNotice } from "./permission-copy";

describe("permission copy", () => {
  it("explains ask / always-approve / auto", () => {
    expect(permissionModeHint("ask")).toContain("每次");
    expect(permissionModeHint("always-approve")).toContain("不再逐条");
    expect(permissionModeHint("auto")).toContain("permission.toml");
  });

  it("has a visible timeout notice", () => {
    expect(permissionTimeoutNotice()).toContain("超时");
  });
});
