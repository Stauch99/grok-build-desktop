import { describe, expect, it } from "vitest";
import { settingRowVisible } from "./settings-search";

describe("settingRowVisible", () => {
  it("shows every row when the query is empty", () => {
    expect(settingRowVisible("发送快捷键", "Enter 发送", "")).toBe(true);
  });

  it("matches title or description, case insensitive", () => {
    expect(settingRowVisible("发送快捷键", "Enter 发送", "enter")).toBe(true);
    expect(settingRowVisible("外观", "主题", "xyz")).toBe(false);
  });
});
