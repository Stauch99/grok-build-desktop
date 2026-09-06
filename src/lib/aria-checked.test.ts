import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function walkTsx(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) out.push(...walkTsx(p));
    else if (name.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const ROLE = /role="(radio|checkbox|menuitemradio|menuitemcheckbox)"/;

describe("aria-checked pairing", () => {
  it("puts aria-checked on every radio/checkbox role in the same tag", () => {
    const files = walkTsx(join(srcRoot, "components")).concat(join(srcRoot, "Settings.tsx"));
    const missing: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const re = /<([a-zA-Z]+)([^>]*role="(?:radio|checkbox|menuitemradio|menuitemcheckbox)"[^>]*)>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const attrs = m[2];
        if (!ROLE.test(`role="${attrs.match(/role="([^"]+)"/)?.[1] ?? ""}"`)) continue;
        if (!/aria-checked=/.test(attrs)) missing.push(`${file}:${attrs.slice(0, 80)}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
