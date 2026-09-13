import { describe, expect, it } from "vitest";
import { localDayStamp, memoryCursorKey } from "./memory-clock";

describe("memoryCursorKey", () => {
  it("brands the session id", () => {
    expect(memoryCursorKey("grok", "abc")).toBe("grok/abc");
  });
});

describe("localDayStamp", () => {
  it("buckets by the given timezone", () => {
    expect(localDayStamp(Date.parse("2026-08-30T16:00:00Z"), "UTC")).toBe("2026-08-30");
    expect(localDayStamp(Date.parse("2026-08-30T16:00:00Z"), "America/Los_Angeles")).toBe("2026-08-30");
    expect(localDayStamp(Date.parse("2026-08-31T02:00:00Z"), "America/Los_Angeles")).toBe("2026-08-30");
  });
});
