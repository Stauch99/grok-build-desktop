import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../lib/locale-context";
import { EmptyState } from "./EmptyState";

function render(
  locale: "zh" | "en",
  extra: Partial<Parameters<typeof EmptyState>[0]> = {},
) {
  return renderToStaticMarkup(
    createElement(
      LocaleProvider,
      {
        locale,
        children: createElement(EmptyState, {
          doctor: { binary: null, authPresent: false, loginHint: ["kimi login"], agentId: "kimi" },
          agentLabel: "Kimi",
          cwd: "",
          projectCount: 0,
          onPickProject: () => {},
          ...extra,
        }),
      },
    ),
  );
}

describe("EmptyState i18n", () => {
  it("asks for the selected agent CLI, not grok", () => {
    const html = render("zh");
    expect(html).toContain("找不到 Kimi CLI");
    expect(html).not.toContain("grok");
  });

  it("switches the doctor copy with locale", () => {
    expect(render("en")).toContain("Kimi CLI not found");
    expect(render("zh")).not.toContain("Kimi CLI not found");
  });

  it("offers a project picker when the CLI is ready", () => {
    const html = render("en", {
      doctor: { binary: "/usr/bin/kimi", authPresent: true, loginHint: [], agentId: "kimi" },
      onInbox: () => {},
    });
    expect(html).toContain("No project yet");
    expect(html).toContain("Choose a project folder");
    expect(html).toContain("Try the inbox first");
  });
});
