import { describe, expect, it } from "vitest";
import { basename, cleanLogLine, dirname, escapeText, groupArtifactsByFolder, linkifyLocalPaths, relativeTime, resolveOpenTarget, sanitizeHtml, surfaceStderr, textFromContent } from "./text";

describe("basename", () => {
  it("takes the last path segment", () => {
    expect(basename("/Users/foxie/project")).toBe("project");
    expect(basename("/tmp/")).toBe("tmp");
  });
});

describe("dirname / groupArtifactsByFolder", () => {
  it("splits parent dir", () => {
    expect(dirname("/Users/foxie/project/a.md")).toBe("/Users/foxie/project");
    expect(dirname("a.md")).toBe("");
  });
  it("groups files under the parent folder name", () => {
    const groups = groupArtifactsByFolder([
      "/work/design_skill/research-ui-design-skills-20260814.md",
      "/work/design_skill/notes.md",
      "/work/readme.md",
    ]);
    expect(groups).toEqual([
      {
        folder: "design_skill",
        files: [
          { path: "/work/design_skill/research-ui-design-skills-20260814.md", name: "research-ui-design-skills-20260814.md" },
          { path: "/work/design_skill/notes.md", name: "notes.md" },
        ],
      },
      {
        folder: "work",
        files: [{ path: "/work/readme.md", name: "readme.md" }],
      },
    ]);
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-08-14T12:00:00Z");
  it("formats recent times", () => {
    expect(relativeTime("2026-08-14T11:59:30Z", now)).toBe("刚刚");
    expect(relativeTime("2026-08-14T11:40:00Z", now)).toBe("20 分钟前");
    expect(relativeTime("2026-08-14T09:00:00Z", now)).toBe("3 小时前");
  });
  it("returns empty for invalid", () => {
    expect(relativeTime("", now)).toBe("");
    expect(relativeTime("not-a-date", now)).toBe("");
  });
});

describe("sanitizeHtml", () => {
  it("strips script and event handlers", () => {
    const dirty = `<p>hi</p><script>alert(1)</script><img src=x onerror="alert(2)">`;
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/onerror/i);
  });
  it("strips javascript urls", () => {
    expect(sanitizeHtml(`<a href="javascript:alert(1)">x</a>`)).not.toMatch(/javascript:/i);
  });
});

describe("escapeText", () => {
  it("escapes html", () => {
    expect(escapeText("<b>x</b>")).toBe("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("resolveOpenTarget", () => {
  it("keeps http and unwraps file urls", () => {
    expect(resolveOpenTarget("https://example.com/a")).toBe("https://example.com/a");
    expect(resolveOpenTarget("file:///Users/foxie/a%20b.ts")).toBe("/Users/foxie/a b.ts");
    expect(resolveOpenTarget("file://localhost/Users/foxie/a.ts")).toBe("/Users/foxie/a.ts");
    expect(resolveOpenTarget("//evil.example/x")).toBeNull();
    expect(resolveOpenTarget("javascript:alert(1)")).toBeNull();
  });
  it("joins relative paths to cwd", () => {
    expect(resolveOpenTarget("src/App.tsx", "/proj")).toBe("/proj/src/App.tsx");
  });
});

describe("linkifyLocalPaths", () => {
  it("wraps absolute user paths outside tags", () => {
    const html = linkifyLocalPaths("<p>see /Users/foxie/a.ts please</p>");
    expect(html).toContain('href="/Users/foxie/a.ts"');
    expect(html).toContain("class=\"file-link\"");
  });

  it("wraps relative workspace paths so they can be previewed", () => {
    const html = linkifyLocalPaths("<p>改了 src/lib/chat.ts 和 ./docs/plan.md</p>");
    expect(html).toContain('href="src/lib/chat.ts"');
    expect(html).toContain('href="./docs/plan.md"');
  });

  it("leaves prose slashes alone", () => {
    const html = linkifyLocalPaths("<p>and/or he/she 24/7</p>");
    expect(html).not.toContain("file-link");
  });

  it("requires a known extension", () => {
    expect(linkifyLocalPaths("<p>see src/lib/thing</p>")).not.toContain("file-link");
    expect(linkifyLocalPaths("<p>see src/lib/thing.exe</p>")).not.toContain("file-link");
  });

  it("stops at CJK punctuation", () => {
    const html = linkifyLocalPaths("<p>见 src/App.tsx。</p>");
    expect(html).toContain('href="src/App.tsx"');
    expect(html).not.toContain("src/App.tsx。\"");
  });

  it("stops at a sentence-final period", () => {
    expect(linkifyLocalPaths("<p>see src/App.tsx.</p>")).toContain('href="src/App.tsx"');
  });

  it("does not truncate a longer real extension", () => {
    expect(linkifyLocalPaths("<p>see src/App.tsx.bak</p>")).not.toContain("file-link");
  });

  it("linkifies a cited image so it can be previewed inline", () => {
    const html = linkifyLocalPaths("<p>见图 /Users/foxie/out/cover.png</p>");
    expect(html).toContain('href="/Users/foxie/out/cover.png"');
    expect(linkifyLocalPaths("<p>改了 assets/hero.webp</p>")).toContain('href="assets/hero.webp"');
  });

  it("does not linkify inside an existing tag attribute", () => {
    const html = linkifyLocalPaths('<a href="src/App.tsx">src/App.tsx</a>');
    expect(html.match(/class="file-link"/g) ?? []).toHaveLength(1);
  });
});

describe("surfaceStderr", () => {
  it("strips ansi leftovers and drops worker transport noise", () => {
    const raw = "[2m2026-08-15T02:54:11Z[0m [31mERROR[0m worker quit with fatal: Transport channel closed, when Client(request::Error";
    expect(cleanLogLine(raw)).not.toMatch(/\[31m/);
    expect(surfaceStderr(raw)).toBeNull();
  });
  it("keeps a real failure line", () => {
    expect(surfaceStderr("failed to start agent: permission denied")).toMatch(/permission denied/);
  });
});

describe("textFromContent", () => {
  it("reads nested text", () => {
    expect(textFromContent({ type: "text", text: "hello" })).toBe("hello");
    expect(textFromContent("plain")).toBe("plain");
    expect(textFromContent(null)).toBe("");
  });
});
