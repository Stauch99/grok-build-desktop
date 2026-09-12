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
    expect(html).toContain("grok-bot");
    expect(html).not.toContain("tabler-icon-star");
    expect(html).not.toContain("dot-matrix");
  });

  it("shows the stall note on the same live row instead of a second banner", () => {
    const html = renderToStaticMarkup(
      createElement(LocaleProvider, {
        locale: "zh",
        children: createElement(WorkLiveRow, {
          startedAt: Date.now() - 244_000,
          note: "已 3 分钟没有新输出，可能卡住了",
          onStop: () => {},
        }),
      }),
    );
    expect(html).toContain("work-live stalled");
    expect(html).toContain("已 3 分钟没有新输出，可能卡住了");
    expect(html).not.toContain("工作了 4m 4s");
  });

  it("offers stop-and-retry beside the live row when the turn is wedged", () => {
    const html = renderToStaticMarkup(
      createElement(LocaleProvider, {
        locale: "zh",
        children: createElement(WorkLiveRow, {
          startedAt: Date.now() - 244_000,
          note: "已 3 分钟没有新输出，可能卡住了",
          onStop: () => {},
          onStopAndRetry: () => {},
        }),
      }),
    );
    expect(html).toContain("work-live-retry");
    expect(html).toContain("停止并重试");
  });
});
