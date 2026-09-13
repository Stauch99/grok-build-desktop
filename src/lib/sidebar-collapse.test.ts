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
    [".group-projects", ".group-projects.open", ".group-projects-inner"],
  ] as const)("%s collapses to 0fr until .open", (closed, opened, inner) => {
    expect(ruleBlock(closed)).toMatch(/grid-template-rows:\s*0fr/);
    expect(ruleBlock(opened)).toMatch(/grid-template-rows:\s*1fr/);
    expect(ruleBlock(closed)).toMatch(/transition:\s*grid-template-rows/);
    const innerBlock = ruleBlock(inner);
    expect(innerBlock).toMatch(/overflow:\s*hidden/);
    expect(innerBlock).toMatch(/min-height:\s*0/);
  });
});

describe("project session clip", () => {
  it("fades the last visible rows when a folder is truncated", () => {
    const clip = ruleBlock(".project-sessions-clip.is-clipped::after");
    expect(clip).toMatch(/pointer-events:\s*none/);
    expect(clip).toMatch(/linear-gradient\(\s*to bottom,\s*transparent,\s*var\(--bg-side\)/);
  });
});

describe("sidebar project indent", () => {
  it("nests folder sessions 16–18px past the folder label", () => {
    expect(ruleBlock(".project-sessions-inner")).toMatch(/padding-left:\s*1[6-8]px/);
    expect(ruleBlock(".project")).toMatch(/margin:\s*0 0 8px/);
  });

  it("does not indent projects under a user group past the group label", () => {
    const inner = ruleBlock(".group-projects-inner");
    expect(inner).not.toMatch(/padding-left/);
    expect(inner).not.toMatch(/margin-left/);
  });

  it("styles group titles like 置顶 / 项目 band labels", () => {
    const label = ruleBlock(".ws-band-label");
    const head = ruleBlock(".group-head");
    expect(head).toMatch(/font-size:\s*var\(--text-xs\)/);
    expect(head).toMatch(/color:\s*var\(--faint\)/);
    expect(head).toMatch(/font-weight:\s*500/);
    expect(label).toMatch(/font-size:\s*var\(--text-xs\)/);
    expect(label).toMatch(/color:\s*var\(--faint\)/);
  });

  it("indents fork children further than top-level folder sessions", () => {
    expect(ruleBlock(".session")).toMatch(/padding:\s*4px 6px/);
    expect(ruleBlock(".session.child")).toMatch(/padding-left:\s*1[6-8]px/);
    expect(ruleBlock(".inbox-list .session")).toMatch(/padding-left:\s*6px/);
  });

  it("sets session titles one pixel smaller than the default UI small size", () => {
    expect(ruleBlock(".session")).toMatch(/font-size:\s*var\(--ui-smaller\)/);
    expect(ruleBlock(".session .title")).toMatch(/font-size:\s*var\(--ui-smaller\)/);
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

describe("sidebar collapse motion", () => {
  it("tweens the column width instead of jumping", () => {
    const app = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../App.tsx"),
      "utf8",
    );
    // The grid column var is driven by the rAF-interpolated slotPx, and the
    // rail class follows the slot — content fades before the slot shrinks.
    expect(app).toContain('["--sidebar-w" as string]: `${sidebarMotion.slotPx}px`');
    expect(app).toContain("collapsed={sidebarMotion.slotCollapsed}");
    expect(app).toContain('data-sidebar-motion={sidebarMotion.moving ? "" : undefined}');
    expect(app).toContain("useSidebarMotion(sidebarCollapsed, sidebarWidth)");
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "./sidebar-motion.ts"),
      "utf8",
    );
    expect(src).toMatch(/requestAnimationFrame/);
    expect(src).toMatch(/performance\.now\(\)/);
  });
});

describe("sidebar nav placement", () => {
  it("pins extra nav links under new-chat, list then account at the bottom", () => {
    const tsx = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../components/Sidebar.tsx"),
      "utf8",
    );
    const chat = tsx.indexOf('className="new-task new-chat');
    const extra = tsx.indexOf('data-nav="extra"');
    const list = tsx.indexOf('className={`session-list');
    const account = tsx.indexOf("<AccountMenu");
    expect(chat).toBeGreaterThan(-1);
    expect(extra).toBeGreaterThan(chat);
    expect(list).toBeGreaterThan(extra);
    expect(account).toBeGreaterThan(list);
  });

  it("keeps the account fade + upward popover at the bottom", () => {
    const fade = ruleBlock(".side-account::before");
    expect(fade).toMatch(/pointer-events:\s*none/);
    expect(fade).toMatch(/linear-gradient\(\s*to top,\s*var\(--bg-side\)/);
    expect(ruleBlock(".sidebar.rail .side-account::before")).toMatch(/content:\s*none/);
    const pop = css.match(/^\.account-pop \{([\s\S]*?)\}/m);
    expect(pop?.[1]).toMatch(/bottom:\s*calc\(100% \+ 4px\)/);
    expect(css).toMatch(/--session-list-end-pad:\s*48px/);
    expect(ruleBlock(".session-list")).toMatch(/padding:\s*0 8px var\(--session-list-end-pad\)/);
    expect(ruleBlock(".session-list.inbox-list")).toMatch(/padding-bottom:\s*0/);
  });
});
