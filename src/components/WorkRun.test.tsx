import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../lib/locale-context";
import type { WorkItem } from "../lib/chat";
import { WorkRun } from "./WorkRun";

function render(items: WorkItem[], extra: Partial<Parameters<typeof WorkRun>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      locale: "zh",
      children: createElement(WorkRun, {
        items,
        runId: "work-t1",
        ...extra,
      }),
    }),
  );
}

describe("WorkRun", () => {
  it("shows the settled summary and keeps the timeline collapsed", () => {
    const html = render([
      { kind: "thought", id: "t", text: "secret-thought-body" },
      { kind: "tool", id: "1", title: "Read a.ts", toolKind: "read", status: "completed" },
    ]);
    expect(html).toContain("使用 1 个工具，操作结果：a.ts");
    expect(html).toContain("work-run-bar");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("secret-thought-body");
    expect(html).not.toContain("work-live");
  });

  it("marks failures on the header without expanding", () => {
    const html = render([
      { kind: "tool", id: "1", title: "Read a.ts", toolKind: "read", status: "failed" },
    ]);
    expect(html).toContain("work-run failed");
    expect(html).toContain("1 个失败");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("work-run-bar");
  });

  it("opens the live spine instead of the grey recap bar", () => {
    const html = render([{ kind: "thought", id: "t", text: "secret-thought-body" }], {
      busy: true,
      startedAt: Date.now() - 12_500,
      onStop: () => {},
    });
    expect(html).toContain("work-run live");
    expect(html).toContain("work-timeline");
    expect(html).toContain("work-live");
    expect(html).toContain("工作了 12s");
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("work-run-bar");
    expect(html).not.toContain("work-run-stop");
    expect(html).not.toContain("dot-matrix");
    expect(html).toContain("shimmer-text");
    expect(html).not.toContain("secret-thought-body");
    expect(html).not.toContain("使用");
    expect(html).not.toContain("过一遍");
  });

  it("settles leftover in-flight tools once the pane is no longer busy", () => {
    const html = render(
      [{ kind: "tool", id: "1", title: "Read a.ts", toolKind: "read", status: "in_progress" }],
      { onStop: () => {} },
    );
    expect(html).not.toContain("work-run live");
    expect(html).not.toContain("work-live");
    expect(html).toContain("work-run-bar");
    expect(html).toContain("使用 1 个工具");
  });

  it("puts stop on the trailing working-for line so the composer dock can stay quiet", () => {
    const html = render([{ kind: "thought", id: "t", text: "…" }], {
      busy: true,
      onStop: () => {},
    });
    expect(html).toContain("work-live");
    expect(html).toContain("停止 · 工作中");
    expect(html).not.toContain("work-run-stop");
    expect(html).not.toContain('aria-label="停止"');
  });
});
