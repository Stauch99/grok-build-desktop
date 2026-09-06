import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../lib/locale-context";
import { ChatRow } from "./Thread";

function renderAssistant(showCopy = true) {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      locale: "zh",
      children: createElement(ChatRow, {
        item: { kind: "assistant", id: "a1", text: "hello `pkg`" },
        dark: false,
        showCopy,
      }),
    }),
  );
}

describe("ChatRow assistant copy", () => {
  it("keeps the copy control in the markup while the turn is still streaming", () => {
    const html = renderAssistant(false);
    expect(html).toContain('class="actions"');
    expect(html).toContain('aria-label="复制"');
  });
});

describe("thread open scroll", () => {
  it("pins a virtual thread to the latest row instead of restoring index 0", () => {
    const src = readFileSync(new URL("./Thread.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/pinToLatest/);
    expect(src).toMatch(/latestThreadRowIndex/);
    expect(src).toMatch(/align:\s*"end"/);
    expect(src).toMatch(/restoreVirtualScrollIndex\([^)]*pinToLatest/);
  });

  it("pins the opened transcript once it is ready, including short non-virtual threads", () => {
    const src = readFileSync(new URL("./Thread.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/readyTranscriptPinKey/);
    expect(src).toMatch(/shouldPinReadyTranscript/);
    expect(src).toMatch(/sessionId/);
    expect(src).toMatch(/scrollHeight/);
    expect(src).not.toMatch(/if \(!pinToLatest \|\| !listActive\) return;/);
  });

  it("wires both panes to follow the latest reply when at the bottom", () => {
    const src = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/pinToLatest=\{paneAtBottom\}/);
    expect(src).toMatch(/pinToLatest=\{atBottom\}/);
    expect(src).toMatch(/sessionId=\{sid\}/);
    expect(src).toMatch(/sessionId=\{sessionId\}/);
    expect(src).toMatch(/loading=\{loadingSession\}/);
    expect(src).not.toMatch(/behavior:\s*"smooth"/);
  });
});
