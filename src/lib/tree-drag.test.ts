import { describe, expect, it } from "vitest";
import { GROK_FILE_PATH_MIME, grokFileDragPath, hasGrokFileDrag, setGrokFileDrag } from "./tree-drag";

function fakeDataTransfer(): DataTransfer {
  const data = new Map<string, string>();
  return {
    effectAllowed: "all",
    get types() {
      return [...data.keys()] as unknown as ReadonlyArray<string>;
    },
    setData: (type: string, value: string) => void data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
  } as unknown as DataTransfer;
}

describe("tree-drag", () => {
  it("round-trips the path under the custom MIME with a text fallback", () => {
    const dt = fakeDataTransfer();
    setGrokFileDrag(dt, "/repo/src/a.ts");
    expect(dt.getData(GROK_FILE_PATH_MIME)).toBe("/repo/src/a.ts");
    expect(dt.getData("text/plain")).toBe("/repo/src/a.ts");
    expect(dt.effectAllowed).toBe("copy");
    expect(hasGrokFileDrag(dt)).toBe(true);
    expect(grokFileDragPath(dt)).toBe("/repo/src/a.ts");
  });

  it("reports foreign drags as absent", () => {
    const dt = fakeDataTransfer();
    dt.setData("text/plain", "hello");
    expect(hasGrokFileDrag(dt)).toBe(false);
    expect(grokFileDragPath(dt)).toBe("");
    expect(hasGrokFileDrag(null)).toBe(false);
    expect(grokFileDragPath(null)).toBe("");
  });
});
