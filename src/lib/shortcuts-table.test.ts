import { describe, expect, it } from "vitest";
import { bindingFor, matchBinding, parseBinding } from "./shortcuts-table";

describe("shortcuts table", () => {
  it("prefers overrides", () => {
    expect(bindingFor({ palette: "Mod+P" }, "palette")).toBe("Mod+P");
    expect(bindingFor({}, "palette")).toBe("Mod+K");
  });

  it("matches a binding", () => {
    expect(parseBinding("Mod+L")).toEqual({ mod: true, shift: false, key: "l" });
    expect(matchBinding("Mod+L", { key: "l", metaKey: true, ctrlKey: false, shiftKey: false })).toBe(true);
    expect(matchBinding("Mod+L", { key: "l", metaKey: false, ctrlKey: false, shiftKey: false })).toBe(false);
  });
});
