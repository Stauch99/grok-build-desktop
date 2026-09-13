import { describe, expect, it } from "vitest";
import type { TimelineDay } from "./memory-growth";
import { countHits, filterDiary, filterTimeline, memorySearchHits } from "./memory-search";

const diary = [
  { date: "2026-09-01", body: "Agent learned the repo layout." },
  { date: "2026-09-02", body: "Nothing new." },
];

const days: TimelineDay[] = [
  { day: "2026-09-01", events: [{ at: 1, kind: "promote", count: 3 }] },
  { day: "2026-09-02", events: [{ at: 2, kind: "session_new" }] },
];

const labelFor = (ev: { kind: string }) => `label:${ev.kind}`;

describe("countHits", () => {
  it("counts case-insensitive substring hits", () => {
    expect(countHits("Repo repo REPO", "repo")).toBe(3);
    expect(countHits("nothing", "x")).toBe(0);
    expect(countHits("any", "  ")).toBe(0);
  });
});

describe("filterDiary", () => {
  it("keeps entries matching date or body", () => {
    expect(filterDiary(diary, "repo")).toHaveLength(1);
    expect(filterDiary(diary, "09-02")).toHaveLength(1);
    expect(filterDiary(diary, "")).toHaveLength(2);
  });
});

describe("filterTimeline", () => {
  it("keeps days by date or event label, narrowing events", () => {
    expect(filterTimeline(days, "promote", labelFor).map((d) => d.day)).toEqual(["2026-09-01"]);
    const byDate = filterTimeline(days, "09-02", labelFor);
    expect(byDate[0].events).toHaveLength(1);
    expect(filterTimeline(days, "zzz", labelFor)).toEqual([]);
  });
});

describe("memorySearchHits", () => {
  it("totals hits across diary, timeline and files", () => {
    const n = memorySearchHits({
      diary,
      days,
      files: [{ heading: "USER.md", path: "/home/u/USER.md" }],
      query: "repo",
      labelFor,
    });
    expect(n).toBe(1);
  });
});
