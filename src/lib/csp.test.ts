import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const conf = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8")) as {
  app: {
    security: {
      csp: string | null;
      assetProtocol: { scope: { allow: string[]; deny: string[] } };
    };
  };
};

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: http://asset.localhost https://asset.localhost blob: data:; media-src 'self' asset: http://asset.localhost https://asset.localhost blob:; font-src 'self' data:; connect-src ipc: http://ipc.localhost https://ipc.localhost; frame-src 'self' asset: http://asset.localhost https://asset.localhost; object-src 'none'; base-uri 'self'; form-action 'none'";

describe("tauri CSP and asset protocol", () => {
  const { csp, assetProtocol } = conf.app.security;

  it("sets a string CSP without unsafe-eval", () => {
    expect(typeof csp).toBe("string");
    expect(csp).not.toBeNull();
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("matches the locked CSP string", () => {
    expect(csp).toBe(CSP);
  });

  it("does not allow connect-src https: wildcard", () => {
    const connect = (csp ?? "").match(/connect-src ([^;]+)/)?.[1] ?? "";
    expect(connect.split(/\s+/)).not.toContain("https:");
  });

  it("does not allow all of $HOME via the asset protocol", () => {
    expect(assetProtocol.scope.allow).not.toContain("$HOME/**");
  });

  it("allows only temp dirs and grok sessions", () => {
    expect(assetProtocol.scope.allow).toEqual([
      "$TEMP/**",
      "/tmp/**",
      "/private/tmp/**",
      "/var/folders/**",
      "/private/var/folders/**",
      "$HOME/.grok/sessions/**",
    ]);
  });

  it("denies secrets under home", () => {
    const lib = readFileSync(join(root, "src-tauri/src/path_policy.rs"), "utf8");
    const block = lib.match(/const ASSET_SECRET_DENY: &\[&str\] = &\[([\s\S]*?)\];/)?.[1] ?? "";
    const rust = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(assetProtocol.scope.deny).toEqual(rust);
  });
});
