import { describe, expect, it } from "vitest";
import { mediaKind, rewriteLocalMediaHtml } from "./media";

const toSrc = (path: string) => `asset://${path}`;

describe("mediaKind", () => {
  it("classifies image and video extensions", () => {
    expect(mediaKind("/a/b.png")).toBe("image");
    expect(mediaKind("shot.JPEG")).toBe("image");
    expect(mediaKind("clip.mp4")).toBe("video");
    expect(mediaKind("notes.md")).toBeNull();
  });
});

describe("rewriteLocalMediaHtml", () => {
  it("rewrites local img src so the webview can load it", () => {
    const html = rewriteLocalMediaHtml(
      `<p><img src="/Users/foxie/out/cover.png" alt="cover"></p>`,
      "/Users/foxie/out",
      toSrc,
    );
    expect(html).toContain('src="asset:///Users/foxie/out/cover.png"');
    expect(html).not.toContain('src="/Users/foxie/out/cover.png"');
  });

  it("embeds an inline preview after a cited media path", () => {
    const html = rewriteLocalMediaHtml(
      `<p>见 <a class="file-link" href="/Users/foxie/out/demo.mp4">/Users/foxie/out/demo.mp4</a></p>`,
      "/Users/foxie/out",
      toSrc,
    );
    expect(html).toContain("md-media");
    expect(html).toContain("<video ");
    expect(html).toContain('src="asset:///Users/foxie/out/demo.mp4"');
  });

  it("puts an image preview inside the cited path link", () => {
    const html = rewriteLocalMediaHtml(
      `<p><a class="file-link" href="/tmp/cover.png">/tmp/cover.png</a></p>`,
      "/tmp",
      toSrc,
    );
    expect(html).toMatch(/<a class="file-link"[^>]*>[\s\S]*md-media[\s\S]*<\/a>/);
  });

  it("resolves a relative image against cwd", () => {
    const html = rewriteLocalMediaHtml(
      `<p><img src="./shot.webp" alt=""></p>`,
      "/work/proj",
      toSrc,
    );
    expect(html).toContain('src="asset:///work/proj/shot.webp"');
  });

  it("does not duplicate a preview when the image is already rendered", () => {
    const html = rewriteLocalMediaHtml(
      `<p><img src="/tmp/a.png" alt="a"><a class="file-link" href="/tmp/a.png">/tmp/a.png</a></p>`,
      "/tmp",
      toSrc,
    );
    expect(html.match(/md-media/g) ?? []).toHaveLength(0);
    expect(html.match(/<img /g) ?? []).toHaveLength(1);
  });

  it("leaves remote images alone", () => {
    const html = rewriteLocalMediaHtml(
      `<p><img src="https://example.com/a.png" alt=""></p>`,
      "/tmp",
      toSrc,
    );
    expect(html).toContain('src="https://example.com/a.png"');
  });
});
