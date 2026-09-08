import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../lib/locale-context";
import type { HeaderJob } from "../lib/jobs-header";
import { JobsMenu } from "./JobsMenu";

function render(jobs: HeaderJob[], extra: Partial<Parameters<typeof JobsMenu>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      locale: "zh",
      children: createElement(JobsMenu, {
        jobs,
        open: true,
        onToggle: () => {},
        onClose: () => {},
        onInspect: () => {},
        onStop: () => {},
        ...extra,
      }),
    }),
  );
}

describe("JobsMenu", () => {
  it("lists window jobs with a stop control on each row", () => {
    const html = render(
      [
        {
          id: "t1",
          title: "[bg] python3 -m http.server",
          status: "in_progress",
          paneId: "main",
          sessionId: "s-main",
        },
        {
          id: "t2",
          title: "bash pnpm test",
          status: "pending",
          paneId: "split",
          sessionId: "s-split",
        },
      ],
      { sessionHint: { "s-split": "分屏会话" }, currentSessionId: "s-main" },
    );
    expect(html).toContain("任务 2");
    expect(html).toContain("[bg] python3 -m http.server");
    expect(html).toContain("bash pnpm test");
    expect(html).toContain("分屏会话");
    expect(html).toContain('aria-label="停止"');
    expect(html).toContain("jobs-stop");
  });
});
