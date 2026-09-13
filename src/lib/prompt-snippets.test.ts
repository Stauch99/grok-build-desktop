import { describe, expect, it } from "vitest";
import {
  SNIPPET_CAP,
  SNIPPETS_KEY,
  deleteSnippet,
  listSnippets,
  saveSnippet,
  updateSnippet,
  type SnippetStorage,
} from "./prompt-snippets";

function memStorage(initial?: string): SnippetStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(SNIPPETS_KEY, initial);
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("prompt-snippets", () => {
  it("starts empty and round-trips saves", () => {
    const store = memStorage();
    expect(listSnippets(store)).toEqual([]);
    const saved = saveSnippet("greeting", "hello there", store);
    expect(saved).not.toBeNull();
    expect(listSnippets(store)).toEqual([
      { id: saved!.id, title: "greeting", body: "hello there" },
    ]);
  });

  it("trims the title and rejects blank input", () => {
    const store = memStorage();
    expect(saveSnippet("  named  ", "body", store)?.title).toBe("named");
    expect(saveSnippet("", "body", store)).toBeNull();
    expect(saveSnippet("t", "   ", store)).toBeNull();
    expect(listSnippets(store)).toHaveLength(1);
  });

  it("generates unique ids", () => {
    const store = memStorage();
    const a = saveSnippet("a", "x", store)!;
    const b = saveSnippet("b", "y", store)!;
    expect(a.id).not.toBe(b.id);
  });

  it("caps the box at SNIPPET_CAP", () => {
    const store = memStorage();
    for (let i = 0; i < SNIPPET_CAP; i++) {
      expect(saveSnippet(`t${i}`, "b", store)).not.toBeNull();
    }
    expect(saveSnippet("overflow", "b", store)).toBeNull();
    expect(listSnippets(store)).toHaveLength(SNIPPET_CAP);
  });

  it("deletes by id and returns the rest", () => {
    const store = memStorage();
    const a = saveSnippet("a", "x", store)!;
    const b = saveSnippet("b", "y", store)!;
    const rest = deleteSnippet(a.id, store);
    expect(rest.map((s) => s.id)).toEqual([b.id]);
    expect(listSnippets(store)).toHaveLength(1);
    expect(deleteSnippet("missing", store)).toHaveLength(1);
  });

  it("updates title/body and rejects blank patches", () => {
    const store = memStorage();
    const a = saveSnippet("a", "x", store)!;
    const next = updateSnippet(a.id, { title: "renamed" }, store);
    expect(next?.[0]?.title).toBe("renamed");
    expect(next?.[0]?.body).toBe("x");
    expect(updateSnippet(a.id, { title: "  " }, store)).toBeNull();
    expect(updateSnippet("nope", { title: "t" }, store)).toBeNull();
  });

  it("reads corrupt JSON and junk entries as empty", () => {
    expect(listSnippets(memStorage("{oops"))).toEqual([]);
    expect(
      listSnippets(memStorage('[{"id":"x","title":"t","body":""},{"id":"y","title":"t","body":"b"}]')),
    ).toEqual([{ id: "y", title: "t", body: "b" }]);
    expect(listSnippets(null)).toEqual([]);
  });
});
