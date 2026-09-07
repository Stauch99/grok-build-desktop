import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../components/DotMatrix.tsx"),
  "utf8",
);

describe("DotMatrix Drive grid", () => {
  it("staggers the chevron wavefront with --d instead of a duration table", () => {
    expect(src).toMatch(/--d/);
    expect(src).toMatch(/length: 9/);
    expect(src).not.toMatch(/const DURATION/);
    expect(src).not.toMatch(/const DELAY/);
  });
});
