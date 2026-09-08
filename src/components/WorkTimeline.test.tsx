import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../lib/locale-context";
import type { WorkItem } from "../lib/chat";
import { WorkLiveRow, WorkTimeline } from "./WorkTimeline";

function render(items: WorkItem[], busy = false, live?: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      locale: "zh",
      children: createElement(WorkTimeline, { items, busy, live, cwd: "/work" }),
    }),
  );
}

describe("WorkTimeline live status", () => {
  it("keeps the trailing working-for line while a tool is in flight", () => {
    const html = render(
      [
        { kind: "tool", id: "1", title: "Read a.ts", toolKind: "read", status: "completed" },
        { kind: "tool", id: "2", title: "Edit b.ts", toolKind: "edit", status: "in_progress" },
      ],
      true,
      createElement("button", { className: "work-live", type: "button" }, "working"),
    );
    expect(html).toContain("work-live");
    expect(html).toContain("spine-row live");
    expect(html).toContain("spine-slot");
    expect(html).not.toContain("dot-matrix");
  });

  it("keeps the trailing live row when no tool is in flight", () => {
    const html = render(
      [{ kind: "tool", id: "1", title: "Read a.ts", toolKind: "read", status: "completed" }],
      true,
      createElement("button", { className: "work-live", type: "button" }, "working"),
    );
    expect(html).toContain("work-live");
  });
});

describe("WorkLiveRow", () => {
  it("uses a quiet whole-second working-for line", () => {
    const html = renderToStaticMarkup(
      createElement(LocaleProvider, {
        locale: "zh",
        children: createElement(WorkLiveRow, {
          startedAt: Date.now() - 244_000,
          onStop: () => {},
        }),
      }),
    );
    expect(html).toContain("work-live");
    expect(html).toContain("工作了 4m 4s");
    expect(html).toContain("shimmer-text");
    expect(html).not.toContain("dot-matrix");
  });
});
