import { describe, expect, it } from "vitest";
import { compareByUpdatedAtDesc, updatedAtMs } from "./session-time";

describe("updatedAtMs", () => {
  it("reads ISO, unix seconds, and unix milliseconds", () => {
    expect(updatedAtMs("2026-08-27T17:00:00.000Z")).toBe(Date.parse("2026-08-27T17:00:00.000Z"));
    expect(updatedAtMs(String(Math.floor(Date.parse("2026-08-27T17:00:00.000Z") / 1000)))).toBe(
      Date.parse("2026-08-27T17:00:00.000Z"),
    );
    expect(updatedAtMs(String(Date.parse("2026-08-27T14:00:00.000Z")))).toBe(
      Date.parse("2026-08-27T14:00:00.000Z"),
    );
  });

  it("treats missing values as unknown", () => {
    expect(updatedAtMs("")).toBe(0);
    expect(updatedAtMs("   ")).toBe(0);
    expect(updatedAtMs(undefined)).toBe(0);
    expect(updatedAtMs("not-a-date")).toBe(0);
  });
});

describe("compareByUpdatedAtDesc", () => {
  it("orders newest first and ties by id", () => {
    const rows = [
      { id: "b", updatedAt: "" },
      { id: "a", updatedAt: "" },
      { id: "old", updatedAt: "2026-08-27T10:00:00.000Z" },
      { id: "new", updatedAt: String(Math.floor(Date.parse("2026-08-27T17:00:00.000Z") / 1000)) },
    ];
    expect([...rows].sort(compareByUpdatedAtDesc).map((r) => r.id)).toEqual(["new", "old", "a", "b"]);
  });
});
