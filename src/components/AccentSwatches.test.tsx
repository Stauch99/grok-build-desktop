import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccentSwatches } from "./AccentSwatches";

function render(value: "blue" | "pink" = "blue") {
  return renderToStaticMarkup(
    createElement(AccentSwatches, {
      value,
      locale: "zh",
      onChange: () => {},
    }),
  );
}

describe("AccentSwatches", () => {
  it("renders six radios and checks the selected color", () => {
    const html = render("pink");
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain("强调色");
    expect(html.match(/role="radio"/g)?.length).toBe(6);
    expect(html).toMatch(/aria-checked="true"[^>]*aria-label="粉"|aria-label="粉"[^>]*aria-checked="true"/);
    expect(html).toContain("#F0549C");
  });
});
