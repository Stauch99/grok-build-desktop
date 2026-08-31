import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { applyPermissionPick, PermissionCard } from "./PermissionCard";

const options = [
  { optionId: "allow", name: "Allow", kind: "allow_once" },
  { optionId: "deny", name: "Deny", kind: "reject_once" },
];

describe("PermissionCard timeout", () => {
  it("still calls onPick when timedOut", () => {
    const onPick = vi.fn();
    applyPermissionPick("allow", {
      options,
      remember: false,
      timedOut: true,
      onPick,
      onAlwaysAllow: vi.fn(),
    });
    expect(onPick).toHaveBeenCalledWith("allow");
  });

  it("keeps option buttons enabled after timeout", () => {
    const html = renderToStaticMarkup(
      createElement(PermissionCard, {
        title: "Edit file",
        options,
        onPick: () => {},
        onAlwaysAllow: () => {},
        timedOut: true,
        timeoutNotice: "许可仍在等待，不会自动拒绝。",
      }),
    );
    expect(html).toContain("许可仍在等待，不会自动拒绝。");
    const buttons = html.match(/<button\b[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((tag) => !/\bdisabled\b/.test(tag))).toBe(true);
  });
});
