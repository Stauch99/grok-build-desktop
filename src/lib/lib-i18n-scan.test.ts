import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));

/**
 * Files converted to i18n keys in round 5. CJK in string literals here means
 * a regression; comments are ignored. Copy tables and matchers stay on the
 * allowlist in i18n.ts / work-run-copy.ts / permission-allow.ts / error-copy.ts / text.ts.
 */
const KEY_BASED = [
  "run-status.ts",
  "session-status.ts",
  "stall.ts",
  "commands.ts",
  "shortcuts-table.ts",
  "permission-queue.ts",
  "agent-doctor.ts",
  "agent-chip.ts",
  "sidebar-list.ts",
  "tool-render.ts",
  "chat.ts",
];

describe("lib i18n scan", () => {
  it("keeps converted lib files free of hardcoded CJK string literals", () => {
    const offenders: string[] = [];
    const names = new Set(readdirSync(dir));
    for (const name of KEY_BASED) {
      expect(names.has(name), `missing ${name}`).toBe(true);
      const text = readFileSync(join(dir, name), "utf8");
      const code = text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "")
        .replace(/\/(?:\\.|[^/\n])+\/[gimsuy]*/g, "");
      if (/["'`][^"'`]*[\u4e00-\u9fff]/.test(code)) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });
});
