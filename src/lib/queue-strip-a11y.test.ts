import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../components/QueueStrip.tsx"),
  "utf8",
);

describe("QueueStrip a11y", () => {
  it("uses a real button to remove a queued prompt", () => {
    expect(src).toMatch(/<button[^>]*className="queue-x"/);
    expect(src).not.toMatch(/classList\.contains\("queue-x"\)/);
    expect(src).toMatch(/e\.altKey/);
    expect(src).toMatch(/ArrowUp/);
  });
});
