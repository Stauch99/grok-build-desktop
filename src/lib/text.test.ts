import { describe, expect, it } from "vitest";
import { basename, cleanLogLine, dirname, escapeText, groupArtifactsByFolder, linkifyLocalPaths, relativeTime, resolveOpenTarget, sanitizeHtml, sanitizeSvg, shouldClearBusyOnAgentStderr, surfaceStderr, textFromContent, textFromRawOutput } from "./text";

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
    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/onerror/i);
    expect(clean).toContain("<p>hi</p>");
  });
  it("strips javascript urls", () => {
    expect(sanitizeHtml(`<a href="javascript:alert(1)">x</a>`)).not.toMatch(/javascript:/i);
  });
  it("strips entity-encoded javascript URLs", () => {
    const clean = sanitizeHtml(`<a href="javascrip&#116;:alert(1)">x</a>`);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).not.toMatch(/alert\(/i);
  });
  it("strips unclosed iframe, object, and embed", () => {
    const clean = sanitizeHtml(
      `<p>keep</p><iframe src="https://evil.test"><object data="x"><embed src="y">`,
    );
    expect(clean).not.toMatch(/<iframe/i);
    expect(clean).not.toMatch(/<object/i);
    expect(clean).not.toMatch(/<embed/i);
    expect(clean).toContain("<p>keep</p>");
  });
  it("strips base href and meta refresh", () => {
    const clean = sanitizeHtml(
      `<base href="https://evil.test/"><meta http-equiv="refresh" content="0;url=https://evil.test"><p>ok</p>`,
    );
    expect(clean).not.toMatch(/<base/i);
    expect(clean).not.toMatch(/<meta/i);
    expect(clean).toContain("<p>ok</p>");
  });
  it("strips svg and math mutation XSS", () => {
    const clean = sanitizeHtml(
      `<svg><script>alert(1)</script></svg><math><mi xlink:href="javascript:alert(1)">x</mi></math><p>ok</p>`,
    );
    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).toContain("<p>ok</p>");
  });
  it("keeps http(s) links and checked asset: URLs", () => {
    const clean = sanitizeHtml(
      `<a href="https://example.com/a">docs</a><img src="asset://localhost/%2Fwork/out/hero.png">`,
    );
    expect(clean).toContain('href="https://example.com/a"');
    expect(clean).toContain("asset://localhost/%2Fwork/out/hero.png");
  });
});

describe("sanitizeSvg", () => {
  it("keeps a mermaid svg and strips nested script", () => {
    const clean = sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><g id="ok"/></svg>`);
    expect(clean).toMatch(/<svg/i);
    expect(clean).not.toMatch(/<script/i);
    expect(clean).toMatch(/id="ok"/);
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

  it("strips a mention @ so paste images resolve to the real file", () => {
    expect(resolveOpenTarget("@/Users/foxie/.grok/sessions/pastes/1-image.png")).toBe(
      "/Users/foxie/.grok/sessions/pastes/1-image.png",
    );
    expect(resolveOpenTarget("@src/App.tsx", "/proj")).toBe("/proj/src/App.tsx");
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

  it("linkifies @-mentioned paste images with a real filesystem href", () => {
    const html = linkifyLocalPaths("@/Users/foxie/.grok/sessions/pastes/1-image.png");
    expect(html).toContain('href="/Users/foxie/.grok/sessions/pastes/1-image.png"');
    expect(html).not.toContain('href="@/');
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
  it("keeps a Codex prompt auth failure", () => {
    expect(
      surfaceStderr(
        "[SYSTEM_ERROR] Prompt for session abc failed: RequestError: Authentication required: refresh token",
      ),
    ).toMatch(/Authentication required/);
    expect(surfaceStderr("Authentication required")).toBe("Authentication required");
  });
  it("surfaces Chinese errors that are not noise", () => {
    expect(surfaceStderr("无法连接远端服务")).toMatch(/无法连接/);
  });
});

describe("shouldClearBusyOnAgentStderr", () => {
  it("clears busy on a prompt SYSTEM_ERROR, not on MCP transport noise", () => {
    expect(
      shouldClearBusyOnAgentStderr(
        "[SYSTEM_ERROR] Prompt for session abc failed: RequestError: Authentication required",
      ),
    ).toBe(true);
    expect(shouldClearBusyOnAgentStderr("worker quit with fatal: Transport channel closed")).toBe(false);
    expect(shouldClearBusyOnAgentStderr("")).toBe(false);
  });
});

describe("textFromContent", () => {
  it("reads nested text", () => {
    expect(textFromContent({ type: "text", text: "hello" })).toBe("hello");
    expect(textFromContent("plain")).toBe("plain");
    expect(textFromContent(null)).toBe("");
  });

  it("joins text blocks and thinking fields", () => {
    expect(textFromContent([{ type: "text", text: "a" }, { text: "b" }])).toBe("ab");
    expect(textFromContent({ thinking: "hmm" })).toBe("hmm");
  });
});

describe("textFromRawOutput", () => {
  it("reads grok nested Content, codex formatted_output, and kimi output", () => {
    expect(
      textFromRawOutput({ type: "ListDir", Content: { content: "/tmp\n" } }),
    ).toBe("/tmp\n");
    expect(textFromRawOutput({ formatted_output: "ok" })).toBe("ok");
    expect(textFromRawOutput({ output: "read 12 lines" })).toBe("read 12 lines");
    expect(textFromRawOutput("plain")).toBe("plain");
  });
});
