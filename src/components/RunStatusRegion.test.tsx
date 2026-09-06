import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../lib/locale-context";
import { RunStatusRegion } from "./RunStatusRegion";

function render(kind: "idle" | "running" | "stalled" | "permission") {
  const labels = {
    idle: "",
    running: "正在运行",
    stalled: "运行可能停滞",
    permission: "需要许可",
  };
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      locale: "zh",
      children: createElement(RunStatusRegion, {
        status: { kind, label: labels[kind], detail: kind === "stalled" ? "已 60 秒没有新输出" : undefined },
      }),
    }),
  );
}

describe("RunStatusRegion", () => {
  it("hides idle and running — the thread work-run is the live chrome", () => {
    expect(render("idle")).toBe("");
    expect(render("running")).toBe("");
  });

  it("still shows stalled and permission capsules", () => {
    expect(render("stalled")).toContain("运行可能停滞");
    expect(render("permission")).toContain("需要许可");
  });
});
