import { describe, expect, it } from "vitest";
import {
  claudeAuthEvidence,
  codexAuthEvidence,
  doctorFromEvidence,
  grokAuthEvidence,
  kimiAuthEvidence,
} from "./agent-auth";

describe("auth evidence", () => {
  it("lets an API key win over a login session", () => {
    expect(grokAuthEvidence({ authJsonExists: true, apiKey: "x" })).toEqual({
      hasSubscriptionSession: true,
      hasApiKey: true,
    });
    expect(kimiAuthEvidence({ loginExists: true, apiKey: "  " })).toEqual({
      hasSubscriptionSession: true,
      hasApiKey: false,
    });
    expect(claudeAuthEvidence({ oauthSession: true, anthropicApiKey: "sk" })).toEqual({
      hasSubscriptionSession: true,
      hasApiKey: true,
    });
    expect(codexAuthEvidence({ chatgptLogin: true, openaiApiKey: null, codexApiKey: "c" })).toEqual({
      hasSubscriptionSession: true,
      hasApiKey: true,
    });
  });
});

describe("doctorFromEvidence", () => {
  it("classifies api when both exist", () => {
    const d = doctorFromEvidence("claude", "/Users/me", {
      hasSubscriptionSession: true,
      hasApiKey: true,
    }, { binary: "/usr/bin/npx", version: "2.1.0" });
    expect(d.authKind).toBe("api");
    expect(d.authPresent).toBe(true);
    expect(d.home).toBe("/Users/me/.claude");
    expect(d.binary).toBe("/usr/bin/npx");
    expect(d.version).toBe("2.1.0");
  });

  it("is none when empty", () => {
    expect(doctorFromEvidence("grok", "/Users/me", { hasSubscriptionSession: false, hasApiKey: false }).authKind).toBe("none");
  });
});
