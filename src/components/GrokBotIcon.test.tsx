import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ACCENT_PRESETS } from "../lib/accent";
import { GROK_BOT_SPECS, grokBotEyes, grokBotShape } from "../lib/grok-bot";
import { GrokBotIcon } from "./GrokBotIcon";

describe("GrokBotIcon", () => {
  it("fills the body with currentColor so the accent brand tints it", () => {
    const html = renderToStaticMarkup(createElement(GrokBotIcon, { accent: "blue" }));
    expect(html).toContain('class="grok-bot"');
    expect(html).toContain('data-shape="triangle"');
    expect(html).toMatch(/fill="currentColor"/);
  });

  it("draws white slit eyes narrower than the source capsules", () => {
    const html = renderToStaticMarkup(createElement(GrokBotIcon, { accent: "teal" }));
    const eyes = grokBotEyes("circle");
    expect(html).toContain(`data-shape="circle"`);
    expect(html).toContain(`width="${eyes.left.w}"`);
    expect(html).toContain(`width="${eyes.right.w}"`);
    expect(html).toContain('fill="white"');
    expect(html).not.toContain('width="35.5"');
    expect(html).not.toContain('width="40.2"');
  });

  it("switches silhouette with the selected accent", () => {
    for (const row of ACCENT_PRESETS) {
      const html = renderToStaticMarkup(createElement(GrokBotIcon, { accent: row.id }));
      expect(html).toContain(`data-shape="${grokBotShape(row.id)}"`);
    }
    const cloud = renderToStaticMarkup(createElement(GrokBotIcon, { accent: "orange" }));
    expect(cloud).toContain(GROK_BOT_SPECS.cloud.body.kind === "path" ? GROK_BOT_SPECS.cloud.body.d.slice(0, 24) : "");
  });

  it("loops the source squash and gaze animation", () => {
    const html = renderToStaticMarkup(createElement(GrokBotIcon, { accent: "green" }));
    expect(html).toContain("animateTransform");
    expect(html).toContain('dur="1.6s"');
    expect(html).toContain('repeatCount="indefinite"');
  });
});
