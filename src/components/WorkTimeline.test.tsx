import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../lib/locale-context";
import type { WorkItem } from "../lib/chat";
import { WorkTimeline } from "./WorkTimeline";

function render(items: WorkItem[], busy = false, live?: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      locale: "zh",
      children: createElement(WorkTimeline, { items, busy, live, cwd: "/work" }),
    }),
  );
}

describe("WorkTimeline live status", () => {
  it("puts the pixel grid on the in-flight tool and skips the trailing live row", () => {
    const html = render(
      [
        { kind: "tool", id: "1", title: "Read a.ts", toolKind: "read", status: "completed" },
        { kind: "tool", id: "2", title: "Edit b.ts", toolKind: "edit", status: "in_progress" },
      ],
      true,
      createElement("button", { className: "work-live", type: "button" }, "working"),
    );
    expect(html).toContain("dot-matrix");
    expect(html).toContain("spine-row live");
    expect(html).not.toContain("work-live");
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
