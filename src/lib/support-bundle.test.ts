import { describe, expect, it } from "vitest";
import { redactSecretEnv, supportBundleText } from "./support-bundle";

describe("redactSecretEnv", () => {
  it("masks credential-like keys and leaves PATH", () => {
    expect(redactSecretEnv("HTTP_PROXY", "http://user:pass@127.0.0.1:7890")).toBe(
      "http://127.0.0.1:7890",
    );
    expect(redactSecretEnv("GROK_API_KEY", "sk-live-secret")).toBe("[redacted]");
    expect(redactSecretEnv("PATH", "/usr/bin:/bin")).toBe("/usr/bin:/bin");
  });
});

describe("supportBundleText", () => {
  it("includes version and doctor rows without auth file contents", () => {
    const text = supportBundleText({
      version: "0.6.1",
      locale: "zh",
      doctors: [
        {
          agentId: "grok",
          binary: "/Users/me/.grok/bin/grok",
          version: "0.2.112",
          home: "/Users/me/.grok",
          authPresent: true,
          authKind: "subscription",
          loginHint: ["grok auth login"],
        },
      ],
      env: {
        PATH: "/usr/bin",
        GROK_API_KEY: "sk-secret",
        HTTP_PROXY: "http://user:pass@127.0.0.1:7890",
      },
    });
    expect(text).toContain("0.6.1");
    expect(text).toContain("grok");
    expect(text).toContain("0.2.112");
    expect(text).toContain("subscription");
    expect(text).not.toContain("sk-secret");
    expect(text).toContain("[redacted]");
    expect(text).toContain("http://127.0.0.1:7890");
    expect(text).not.toContain("user:pass");
  });
});
