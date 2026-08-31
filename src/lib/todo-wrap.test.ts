import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../styles.css"),
  "utf8",
);

function ruleBlock(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `missing rule ${selector}`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unclosed rule ${selector}`);
}

describe("todo wrap CSS", () => {
  it("lets the task label shrink and wrap inside the row", () => {
    const li = ruleBlock(".todo li");
    expect(li).toMatch(/min-width:\s*0/);
    const text = ruleBlock(".todo-text");
    expect(text).toMatch(/min-width:\s*0/);
    expect(text).toMatch(/flex:\s*1/);
    expect(text).toMatch(/overflow-wrap:\s*anywhere/);
    expect(text).toMatch(/white-space:\s*normal/);
  });
});
