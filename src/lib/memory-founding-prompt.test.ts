import { describe, expect, it } from "vitest";
import { domainPrompt, foundingPrompt, mergePrompt } from "./memory-founding-prompt";

describe("foundingPrompt", () => {
  it("asks for a 大梦 chapter and four markers", () => {
    const text = foundingPrompt({
      episodes: "was: 保录 → now: 兜底",
      userMd: "# You\n",
      skillNames: ["beldore-pdf"],
      memoryClip: "Path: /tmp",
      day: "2026-09-09",
    });
    expect(text).toMatch(/## 大梦 · 2026-09-09/);
    expect(text).toMatch(/<<<DIARY>>>/);
    expect(text).toMatch(/<<<SKILLS>>>/);
    expect(text).toMatch(/beldore-pdf/);
    expect(text).toMatch(/兜底/);
  });
});

describe("domainPrompt", () => {
  it("names the domain", () => {
    expect(domainPrompt({ domain: "GlobalEdu", episodes: "x", skillNames: [] })).toMatch(/GlobalEdu/);
  });
});

describe("mergePrompt", () => {
  it("reuses the founding marker contract", () => {
    const text = mergePrompt({
      domainNotes: "note",
      userMd: "# You\n",
      skillNames: [],
      memoryClip: "",
      day: "2026-09-09",
    });
    expect(text).toMatch(/<<<TAGLINE>>>/);
    expect(text).toMatch(/note/);
  });
});
