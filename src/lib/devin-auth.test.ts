import { describe, expect, it } from "vitest";
import {
  buildDevinAuthenticate,
  DEVIN_AUTH_METHOD,
  isAcpAuthRequiredError,
  shouldShowDevinAuthCard,
} from "./devin-auth";

describe("buildDevinAuthenticate", () => {
  it("sends _meta.api_key for the api-key path", () => {
    expect(buildDevinAuthenticate("sk-live-123")).toEqual({
      method: "authenticate",
      params: { methodId: DEVIN_AUTH_METHOD, _meta: { api_key: "sk-live-123" } },
    });
  });

  it("omits _meta for the browser PKCE path", () => {
    expect(buildDevinAuthenticate()).toEqual({
      method: "authenticate",
      params: { methodId: "devin-browser" },
    });
  });

  it("treats blank keys as the browser path", () => {
    expect(buildDevinAuthenticate("   ").params).toEqual({ methodId: "devin-browser" });
    expect(buildDevinAuthenticate("").params).toEqual({ methodId: "devin-browser" });
  });
});

describe("isAcpAuthRequiredError", () => {
  it("matches the -32000 ACP host error shape", () => {
    expect(
      isAcpAuthRequiredError({
        code: -32000,
        message:
          "ACP host has not authenticated. Call the `authenticate` ACP method with `meta.api_key` set.",
      }),
    ).toBe(true);
    expect(
      isAcpAuthRequiredError({
        error: { code: -32000, message: "ACP host has not authenticated" },
      }),
    ).toBe(true);
  });

  it("matches Error instances carrying the devin message", () => {
    expect(
      isAcpAuthRequiredError(new Error("ACP host has not authenticated — call authenticate")),
    ).toBe(true);
    expect(isAcpAuthRequiredError(new Error("session is not authenticated"))).toBe(true);
  });

  it("rejects unrelated errors", () => {
    expect(isAcpAuthRequiredError(new Error("rpc error"))).toBe(false);
    expect(isAcpAuthRequiredError(new Error("Authentication required"))).toBe(false);
    expect(isAcpAuthRequiredError(new Error("Authentication failed: invalid api key"))).toBe(false);
    expect(isAcpAuthRequiredError({ code: -32603, message: "internal error" })).toBe(false);
    expect(isAcpAuthRequiredError({ code: -32000, message: "unrelated server error" })).toBe(false);
    expect(isAcpAuthRequiredError("not authenticated")).toBe(false);
    expect(isAcpAuthRequiredError(null)).toBe(false);
    expect(isAcpAuthRequiredError(undefined)).toBe(false);
  });
});

describe("shouldShowDevinAuthCard", () => {
  it("shows only for devin while the flow is actionable", () => {
    expect(shouldShowDevinAuthCard("devin", "needed")).toBe(true);
    expect(shouldShowDevinAuthCard("devin", "busy")).toBe(true);
    expect(shouldShowDevinAuthCard("devin", "failed")).toBe(true);
    expect(shouldShowDevinAuthCard("devin", "idle")).toBe(false);
    expect(shouldShowDevinAuthCard("devin", "checking")).toBe(false);
    expect(shouldShowDevinAuthCard("devin", "ok")).toBe(false);
    expect(shouldShowDevinAuthCard("grok", "needed")).toBe(false);
    expect(shouldShowDevinAuthCard(null, "needed")).toBe(false);
  });
});
