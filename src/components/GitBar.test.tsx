import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GitStatus } from "../api";
import { LocaleProvider } from "../lib/locale-context";
import { GitBar } from "./GitBar";

const repo = (over: Partial<GitStatus> = {}): GitStatus => ({
  isRepo: true,
  root: "/repo",
  branch: "feat/handbook-pipeline",
  dirty: 1,
  ahead: 0,
  behind: 0,
  remote: "origin",
  hasUpstream: true,
  ...over,
});

function renderBar(status: GitStatus, extra: Partial<Parameters<typeof GitBar>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      locale: "zh",
      children: createElement(GitBar, {
        status,
        onNewWorktree: () => {},
        onPull: () => {},
        onPush: () => {},
        ...extra,
      }),
    }),
  );
}

describe("GitBar sync loop", () => {
  it("asks for an origin URL when the repo has no remote", () => {
    const html = renderBar(repo({ remote: "", hasUpstream: false }));
    expect(html).toContain("添加远程");
    expect(html).toContain("远程地址");
    expect(html).toContain("当前仓库没有远程地址");
    expect(html).not.toContain("拉取");
    expect(html).not.toContain("推送");
  });

  it("renames push to publish and disables pull when the branch is untracked", () => {
    const html = renderBar(repo({ hasUpstream: false }));
    expect(html).toContain("发布");
    expect(html).toContain("先发布此分支");
    expect(html).toContain('disabled="" data-tip="先发布此分支"');
    expect(html).not.toContain("添加远程");
  });

  it("keeps pull and push when the branch already tracks origin", () => {
    const html = renderBar(repo());
    expect(html).toContain("拉取");
    expect(html).toContain("推送");
    expect(html).not.toContain("发布");
    expect(html).not.toContain("添加远程");
  });
});
