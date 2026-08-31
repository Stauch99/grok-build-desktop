import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../styles/sidebar.css"),
  "utf8",
);

function ruleBlock(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `missing rule ${selector}`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unclosed rule ${selector}`);
}

describe("sidebar collapse CSS", () => {
  it("balances braces so later rules are not dropped", () => {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
    let depth = 0;
    for (const ch of stripped) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });

  it.each([
    [".project-sessions", ".project-sessions.open", ".project-sessions-inner"],
    [".session-kids", ".session-kids.open", ".session-kids-inner"],
  ] as const)("%s collapses to 0fr until .open", (closed, opened, inner) => {
    expect(ruleBlock(closed)).toMatch(/grid-template-rows:\s*0fr/);
    expect(ruleBlock(opened)).toMatch(/grid-template-rows:\s*1fr/);
    const innerBlock = ruleBlock(inner);
    expect(innerBlock).toMatch(/overflow:\s*hidden/);
    expect(innerBlock).toMatch(/min-height:\s*0/);
  });
});

describe("sidebar project indent", () => {
  it("nests folder sessions 16–18px past the folder label", () => {
    expect(ruleBlock(".project-sessions-inner")).toMatch(/padding-left:\s*1[6-8]px/);
    expect(ruleBlock(".project")).toMatch(/margin:\s*0 0 8px/);
  });

  it("indents fork children further than top-level folder sessions", () => {
    expect(ruleBlock(".session")).toMatch(/padding:\s*4px 6px/);
    expect(ruleBlock(".session.child")).toMatch(/padding-left:\s*1[6-8]px/);
    expect(ruleBlock(".inbox-list .session")).toMatch(/padding-left:\s*6px/);
  });
});

describe("collapsed rail affordance", () => {
  it("gives rail icon buttons a larger hit, line, and hover fill", () => {
    const btn = ruleBlock(".sidebar.rail .icon-btn");
    expect(btn).toMatch(/width:\s*36px/);
    expect(btn).toMatch(/height:\s*36px/);
    expect(btn).toMatch(/border:\s*1px solid var\(--line\)/);
    expect(ruleBlock(".sidebar.rail .icon-btn:hover")).toMatch(/background:\s*var\(--bg-hover\)/);
  });
});

describe("sidebar account fade", () => {
  it("fades the session list into the weekly usage row", () => {
    const fade = ruleBlock(".side-account::before");
    expect(fade).toMatch(/pointer-events:\s*none/);
    expect(fade).toMatch(/linear-gradient\(\s*to top,\s*var\(--bg-side\)/);
    expect(fade).toMatch(/transparent/);
    expect(ruleBlock(".sidebar.rail .side-account::before")).toMatch(/content:\s*none/);
  });
});
