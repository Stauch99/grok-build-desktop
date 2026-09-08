import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { applyPermissionPick, PermissionCard } from "./PermissionCard";
import { QuestionCard } from "./QuestionCard";

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
    expect(html).toMatch(/已等待/);
    expect(html).toMatch(/点击继续处理/);
  });

  it("keeps the command text in a tooltip so a two-line clamp can hide the rest", () => {
    const html = renderToStaticMarkup(
      createElement(PermissionCard, {
        title: "Execute a very long shell script that should not expand the card",
        options,
        onPick: () => {},
        onAlwaysAllow: () => {},
      }),
    );
    expect(html).toMatch(/class="permission-cmd"[^>]*data-tip="Execute a very long shell script/);
  });
});

describe("QuestionCard title", () => {
  it("exposes the full prompt on hover while the heading can clamp", () => {
    const title = "Execute a huge script that also asks 选择课程套餐";
    const html = renderToStaticMarkup(
      createElement(QuestionCard, {
        title,
        options: [{ id: "a", label: "A" }],
        onPick: () => {},
      }),
    );
    expect(html).toMatch(/<h4[^>]*data-tip="Execute a huge script/);
  });

  it("renders a custom answer field when onCustomAnswer is provided", () => {
    const html = renderToStaticMarkup(
      createElement(QuestionCard, {
        title: "Pick one",
        options: [{ id: "a", label: "A" }],
        onPick: () => {},
        onCustomAnswer: () => {},
      }),
    );
    expect(html).toMatch(/自定义回答/);
  });
});
