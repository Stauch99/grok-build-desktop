import { describe, expect, it } from "vitest";
import {
  ACP_IMAGE_BYTE_CAP,
  buildAcpPromptBlocks,
  imageMentionsInText,
  isSessionPastePath,
  prepareAcpPrompt,
  promptCapabilitiesFromInitialize,
  rewriteMentionPaths,
  workspacePasteDest,
  type PromptCapabilities,
} from "./acp-prompt";

describe("promptCapabilitiesFromInitialize", () => {
  it("reads grok-style image:false and embeddedContext:true", () => {
    expect(
      promptCapabilitiesFromInitialize({
        agentCapabilities: { promptCapabilities: { image: false, embeddedContext: true } },
      }),
    ).toEqual({ image: false, embeddedContext: true });
  });

  it("defaults both flags off when the handshake omitted them", () => {
    expect(promptCapabilitiesFromInitialize({})).toEqual({ image: false, embeddedContext: false });
    expect(promptCapabilitiesFromInitialize(null)).toEqual({ image: false, embeddedContext: false });
  });
});

describe("imageMentionsInText", () => {
  it("collects @-mentioned paste images", () => {
    const text = "@/Users/foxie/.grok/sessions/pastes/1-image.png 看这个";
    expect(imageMentionsInText(text)).toEqual(["/Users/foxie/.grok/sessions/pastes/1-image.png"]);
  });

  it("ignores code and docs mentions", () => {
    expect(imageMentionsInText("@/proj/src/App.tsx 修一下")).toEqual([]);
  });
});

describe("session paste workspace copy", () => {
  it("detects grok session paste paths", () => {
    expect(isSessionPastePath("/Users/foxie/.grok/sessions/pastes/1-image.png")).toBe(true);
    expect(isSessionPastePath("/proj/shot.png")).toBe(false);
  });

  it("places a copy under the project .grok/pastes folder", () => {
    expect(workspacePasteDest("/work/proj", "/Users/foxie/.grok/sessions/pastes/1-image.png")).toBe(
      "/work/proj/.grok/pastes/1-image.png",
    );
  });
});

describe("rewriteMentionPaths", () => {
  it("rewrites only the @mention of the original paste", () => {
    const text = "@/Users/me/.grok/sessions/pastes/1-image.png 看图";
    expect(
      rewriteMentionPaths(text, {
        "/Users/me/.grok/sessions/pastes/1-image.png": "/work/proj/.grok/pastes/1-image.png",
      }),
    ).toBe("@/work/proj/.grok/pastes/1-image.png 看图");
  });
});

describe("buildAcpPromptBlocks", () => {
  const png = {
    path: "/work/proj/.grok/pastes/1-image.png",
    mime: "image/png",
    data: "iVBORw0KGgo=",
  };
  const text = "@/work/proj/.grok/pastes/1-image.png 看图";

  it("sends an image block when the CLI advertised image:true", () => {
    const caps: PromptCapabilities = { image: true, embeddedContext: true };
    expect(buildAcpPromptBlocks({ text, caps, images: [png] })).toEqual([
      { type: "text", text },
      { type: "image", mimeType: "image/png", data: png.data, uri: "file:///work/proj/.grok/pastes/1-image.png" },
    ]);
  });

  it("embeds a resource blob when only embeddedContext is on (Grok)", () => {
    const caps: PromptCapabilities = { image: false, embeddedContext: true };
    expect(buildAcpPromptBlocks({ text, caps, images: [png] })).toEqual([
      { type: "text", text },
      {
        type: "resource",
        resource: {
          uri: "file:///work/proj/.grok/pastes/1-image.png",
          mimeType: "image/png",
          blob: png.data,
        },
      },
    ]);
  });

  it("stays text-only when the CLI cannot take image or embedded bytes", () => {
    const caps: PromptCapabilities = { image: false, embeddedContext: false };
    expect(buildAcpPromptBlocks({ text, caps, images: [png] })).toEqual([{ type: "text", text }]);
  });

  it("does not embed when the payload is over the vision cap", () => {
    const caps: PromptCapabilities = { image: true, embeddedContext: true };
    const huge = { ...png, bytes: ACP_IMAGE_BYTE_CAP + 1 };
    expect(buildAcpPromptBlocks({ text, caps, images: [huge] })).toEqual([{ type: "text", text }]);
  });

  it("keeps a plain prompt as a single text block", () => {
    expect(
      buildAcpPromptBlocks({
        text: "hello",
        caps: { image: true, embeddedContext: true },
        images: [],
      }),
    ).toEqual([{ type: "text", text: "hello" }]);
  });
});

describe("prepareAcpPrompt", () => {
  it("copies a session paste into the workspace then embeds for Grok", async () => {
    const src = "/Users/me/.grok/sessions/pastes/1-image.png";
    const dest = "/work/proj/.grok/pastes/1-image.png";
    const blocks = await prepareAcpPrompt({
      text: `@${src} 看图`,
      cwd: "/work/proj",
      caps: { image: false, embeddedContext: true },
      load: async (path) =>
        path === dest ? { mime: "image/png", data: "abc", bytes: 3 } : null,
      copyIntoWorkspace: async () => dest,
    });
    expect(blocks).toEqual([
      { type: "text", text: `@${dest} 看图` },
      {
        type: "resource",
        resource: { uri: `file://${dest}`, mimeType: "image/png", blob: "abc" },
      },
    ]);
  });
});
