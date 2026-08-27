import { describe, expect, it } from "vitest";
import { isEditableShortcutTarget } from "./shortcut-target";

describe("isEditableShortcutTarget", () => {
  it.each(["input", "textarea", "select", "button"])("treats %s as editable", (tagName) => {
    expect(isEditableShortcutTarget({ tagName, isContentEditable: false, parentElement: null })).toBe(true);
  });
  it("recognizes contenteditable ancestors", () => {
    const editable = { tagName: "div", isContentEditable: true, parentElement: null };
    expect(isEditableShortcutTarget({ tagName: "span", isContentEditable: false, parentElement: editable })).toBe(true);
  });
  it("preserves shortcuts for ordinary targets", () => {
    expect(isEditableShortcutTarget({ tagName: "div", isContentEditable: false, parentElement: null })).toBe(false);
  });
});
