import { describe, expect, it } from "vitest";
import { isExternalHttp, marketplaceJsonHelp, serveStatusLines } from "./copy-help";

describe("marketplaceJsonHelp", () => {
  it("explains marketplace.json without inventing a store", () => {
    const text = marketplaceJsonHelp();
    expect(text).toContain("marketplace.json");
    expect(text).toContain("grok plugin marketplace");
  });
});

describe("serveStatusLines", () => {
  it("is a read-only grok agent serve reminder", () => {
    expect(serveStatusLines()).toEqual(["grok agent serve"]);
  });
});

describe("isExternalHttp", () => {
  it("opens http(s) outside the shell", () => {
    expect(isExternalHttp("https://x.com")).toBe(true);
    expect(isExternalHttp("http://127.0.0.1/docs")).toBe(true);
    expect(isExternalHttp("/tmp/file.ts")).toBe(false);
    expect(isExternalHttp("file:///tmp/a")).toBe(false);
  });
});
