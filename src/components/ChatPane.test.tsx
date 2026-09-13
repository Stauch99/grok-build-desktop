import { createElement } from "react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emptyChat } from "../lib/chat";
import { createPaneChatStore } from "../lib/pane-chat-store";
import { ChatPane } from "./ChatPane";
import { LocaleProvider } from "../lib/locale-context";
import { renderToStaticMarkup } from "react-dom/server";

describe("ChatPane", () => {
  it("renders the truncated banner from the pane store", () => {
    const store = createPaneChatStore();
    store.setMainChat({
      ...emptyChat(),
      truncated: true,
      items: [{ kind: "user", id: "u1", text: "hi" }],
      nextId: 2,
    });
    const html = renderToStaticMarkup(
      createElement(LocaleProvider, {
        locale: "zh",
        children: createElement(ChatPane, {
          store,
          paneId: "main",
          chatWidth: 680,
          dark: false,
          cwd: "/w",
          showThinking: false,
          emptyTitle: "",
          onCancel: () => {},
          chatRef: { current: null },
          onScroll: () => {},
          atBottom: true,
          onJumpBottom: () => {},
        }),
      }),
    );
    expect(html).toContain("未加载更早记录");
  });

  it("is the thread host in App", () => {
    const src = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/<ChatPane[\s\S]*store=\{paneChatStore\}/);
    expect(src).not.toMatch(/<ThreadColumn/);
  });
});
