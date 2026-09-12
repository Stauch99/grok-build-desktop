import { describe, expect, it } from "vitest";
import { isAgentId, type AgentId } from "./agent-id";
import {
  USD_TICKS,
  cacheHitRate,
  filterTurns,
  formatTokenZh,
  formatUsdFromTicks,
  modelCostRows,
  parseTurnUsage,
  sharePct,
  summarizeTurns,
  usageMixShares,
  uncachedInput,
  dailyUsageBars,
  formatDayTick,
  formatChartTick,
  dayBarTip,
  chartBarPx,
  showChartTick,
  isTodayBar,
  mapTokenTurnRow,
  USAGE_BRAND_OPTIONS,
  type TokenTurn,
} from "./token-usage";

const turn = (over: Partial<TokenTurn> = {}): TokenTurn => ({
  at: 1_000_000,
  cwd: "/work/app",
  model: "grok-4.6-build",
  input: 2_534_077,
  output: 31_981,
  cacheRead: 2_273_152,
  cacheCreate: 0,
  total: 2_566_058,
  modelCalls: 24,
  costTicks: 3_145_530_400,
  ...over,
});

describe("parseTurnUsage", () => {
  it("reads ACP turn_completed usage including cache and cost ticks", () => {
    expect(
      parseTurnUsage(
        {
          sessionUpdate: "turn_completed",
          usage: {
            inputTokens: 1000,
            outputTokens: 40,
            totalTokens: 1040,
            cachedReadTokens: 800,
            cacheCreationTokens: 10,
            modelCalls: 3,
            costUsdTicks: 12_689_0500,
            modelUsage: { "grok-4.6-build": { inputTokens: 1000 } },
          },
        },
        { at: 50, cwd: "/work" },
      ),
    ).toEqual({
      at: 50,
      cwd: "/work",
      model: "grok-4.6-build",
      input: 1000,
      output: 40,
      cacheRead: 800,
      cacheCreate: 10,
      total: 1040,
      modelCalls: 3,
      costTicks: 126_890_500,
    });
  });

  it("ignores non-turn updates and empty usage", () => {
    expect(parseTurnUsage({ sessionUpdate: "agent_message_chunk" })).toBeNull();
    expect(parseTurnUsage({ sessionUpdate: "turn_completed" })).toBeNull();
  });
});

describe("uncachedInput", () => {
  it("subtracts cache read and create from the full prompt", () => {
    expect(uncachedInput(turn())).toBe(260_925);
  });

  it("does not go below zero", () => {
    expect(uncachedInput(turn({ input: 10, cacheRead: 40, cacheCreate: 0 }))).toBe(0);
  });
});

describe("summarizeTurns / filterTurns", () => {
  const now = 10 * 86400000;
  const rows = [
    turn({ at: now - 2 * 86400000, input: 100, output: 10, cacheRead: 40, cacheCreate: 0, total: 110, modelCalls: 2, costTicks: USD_TICKS }),
    turn({ at: now - 20 * 86400000, input: 50, output: 5, cacheRead: 10, cacheCreate: 0, total: 55, modelCalls: 1, costTicks: 0, cwd: "/other", model: "grok-4.5-build" }),
  ];

  it("sums the visible window", () => {
    const sum = summarizeTurns(filterTurns(rows, { days: 7, now }));
    expect(sum.requests).toBe(1);
    expect(sum.input).toBe(100);
    expect(sum.output).toBe(10);
    expect(sum.cacheRead).toBe(40);
    expect(sum.newInput).toBe(60);
    expect(sum.total).toBe(110);
    expect(sum.modelCalls).toBe(2);
    expect(sum.costTicks).toBe(USD_TICKS);
  });

  it("keeps all days when days is 0", () => {
    expect(filterTurns(rows, { days: 0, now })).toHaveLength(2);
  });

  it("filters by model and source", () => {
    expect(filterTurns(rows, { days: 0, now, model: "grok-4.5-build" })).toHaveLength(1);
    expect(filterTurns(rows, { days: 0, now, cwd: "/other" })).toHaveLength(1);
  });
});

describe("formatters", () => {
  it("uses 万 and 亿 for compact Chinese counts", () => {
    expect(formatTokenZh(204_828_306)).toBe("2.05 亿");
    expect(formatTokenZh(18_302_000)).toBe("1830.2 万");
    expect(formatTokenZh(992_000)).toBe("99.2 万");
    expect(formatTokenZh(847)).toBe("847");
  });

  it("converts 1e10 ticks to dollars", () => {
    expect(formatUsdFromTicks(371_083_000_000)).toBe("$37.1083");
    expect(formatUsdFromTicks(0)).toBe("N/A");
  });

  it("reports cache hit rate against the full prompt", () => {
    expect(cacheHitRate({ input: 100, cacheRead: 91 })).toBe(91);
    expect(cacheHitRate({ input: 0, cacheRead: 0 })).toBeNull();
  });

  it("splits the token mix so cache can dominate the story", () => {
    expect(sharePct(58_047_000, 63_142_000)).toBe(91.9);
    expect(sharePct(0, 100)).toBe(0);
    expect(usageMixShares({
      newInput: 4_844_000,
      output: 251_000,
      cacheRead: 58_047_000,
      cacheCreate: 0,
    })).toEqual({
      newInput: 7.7,
      output: 0.4,
      cacheRead: 91.9,
      cacheCreate: 0,
    });
  });

  it("ranks models by cost share", () => {
    expect(modelCostRows({ "grok-4.6-build": 80, opus: 20 })).toEqual([
      { id: "grok-4.6-build", ticks: 80, share: 80 },
      { id: "opus", ticks: 20, share: 20 },
    ]);
  });
});

describe("dailyUsageBars", () => {
  function startOfDay(ms: number): number {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  it("fills every day in the window, including zeros", () => {
    const today = startOfDay(Date.UTC(2026, 7, 28, 12));
    const yday = startOfDay(today - 12 * 3_600_000);
    const twoAgo = startOfDay(yday - 12 * 3_600_000);
    const rows = dailyUsageBars(
      [
        { at: yday + 8 * 3_600_000, total: 100 },
        { at: yday + 9 * 3_600_000, total: 50 },
        { at: today + 3 * 3_600_000, total: 20 },
      ],
      3,
      today + 12 * 3_600_000,
    );
    expect(rows).toEqual([
      { at: twoAgo, used: 0, costTicks: 0, requests: 0 },
      { at: yday, used: 150, costTicks: 0, requests: 2 },
      { at: today, used: 20, costTicks: 0, requests: 1 },
    ]);
  });

  it("caps an open range at 30 days", () => {
    const now = Date.UTC(2026, 7, 28, 12);
    expect(dailyUsageBars([{ at: now, total: 1 }], 0, now)).toHaveLength(30);
  });

  it("sums cost ticks per local day", () => {
    const today = startOfDay(Date.UTC(2026, 7, 28, 12));
    const rows = dailyUsageBars(
      [
        { at: today + 3_600_000, total: 10, costTicks: 100 },
        { at: today + 2 * 3_600_000, total: 5, costTicks: 50 },
      ],
      1,
      today + 12 * 3_600_000,
    );
    expect(rows).toEqual([{ at: today, used: 15, costTicks: 150, requests: 2 }]);
  });
});

describe("chart ticks", () => {
  it("formats a local month/day tick", () => {
    const at = new Date(2026, 7, 28).getTime();
    expect(formatDayTick(at)).toBe("8/28");
  });

  it("keeps empty days at 0px and nonzero days visible", () => {
    expect(chartBarPx(0, 100, 72)).toBe(0);
    expect(chartBarPx(1, 100, 72)).toBe(3);
    expect(chartBarPx(100, 100, 72)).toBe(72);
    expect(chartBarPx(100, 100, 128)).toBe(128);
  });

  it("marks bars on the current local calendar day", () => {
    const today = new Date(2026, 7, 30, 0, 0, 0, 0).getTime();
    expect(isTodayBar(today, today + 12 * 3_600_000)).toBe(true);
    expect(isTodayBar(today + 15 * 3_600_000, today + 12 * 3_600_000)).toBe(true);
    expect(isTodayBar(today - 1, today + 12 * 3_600_000)).toBe(false);
    expect(isTodayBar(today + 86_400_000, today + 12 * 3_600_000)).toBe(false);
  });

  it("labels every day in a week and thins a 30-day axis", () => {
    expect(showChartTick(3, 7)).toBe(true);
    expect(showChartTick(1, 30)).toBe(false);
    expect(showChartTick(0, 30)).toBe(true);
    expect(showChartTick(5, 30)).toBe(true);
    expect(showChartTick(29, 30)).toBe(true);
  });

  it("uses month/day at the ends and day-only in a dense axis", () => {
    const at = new Date(2026, 7, 28).getTime();
    expect(formatChartTick(3, 7, at)).toBe("8/28");
    expect(formatChartTick(1, 30, at)).toBe("");
    expect(formatChartTick(5, 30, at)).toBe("28");
    expect(formatChartTick(0, 30, at)).toBe("8/28");
  });

  it("names the hovered day with tokens, cost, and request count", () => {
    const at = new Date(2026, 7, 28).getTime();
    expect(dayBarTip({ at, used: 0, costTicks: 0, requests: 0 })).toBe("8月28日 · 0");
    expect(dayBarTip({ at, used: 992_000, costTicks: USD_TICKS, requests: 4 })).toBe(
      "8月28日 · 99.2 万 · $1.0000 · 4 次",
    );
  });
});

describe("filterTurns agent brand", () => {
  const grok = turn({ agentId: "grok" as AgentId, total: 10 });
  const claude = turn({ agentId: "claude" as AgentId, total: 20, model: "opus" });
  const legacy = turn({ total: 30 }); // no agentId

  it("treats missing agentId as grok", () => {
    expect(filterTurns([grok, claude, legacy], { days: 0, agentId: "grok" }).map((t) => t.total)).toEqual([10, 30]);
  });

  it("filters a single brand", () => {
    expect(filterTurns([grok, claude, legacy], { days: 0, agentId: "claude" }).map((t) => t.total)).toEqual([20]);
  });

  it("keeps every brand when agentId is all or omitted", () => {
    expect(filterTurns([grok, claude], { days: 0 }).length).toBe(2);
    expect(filterTurns([grok, claude], { days: 0, agentId: "all" }).length).toBe(2);
  });
});

describe("parseTurnUsage agentId meta", () => {
  it("stamps agentId from meta", () => {
    const row = parseTurnUsage(
      {
        sessionUpdate: "turn_completed",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      },
      { at: 1, cwd: "/w", agentId: "kimi" },
    );
    expect(row?.agentId).toBe("kimi");
  });
});

describe("USAGE_BRAND_OPTIONS", () => {
  it("lists 全部 then the four CLIs", () => {
    expect(USAGE_BRAND_OPTIONS.map((o) => o.value)).toEqual(["all", "grok", "kimi", "claude", "codex"]);
    expect(USAGE_BRAND_OPTIONS[0]?.label).toBe("全部");
  });
});

describe("mapTokenTurnRow", () => {
  it("keeps a valid agentId and drops junk", () => {
    expect(mapTokenTurnRow({ total: 9, agentId: "claude" }).agentId).toBe("claude");
    expect(mapTokenTurnRow({ total: 9, agentId: "gemini" }).agentId).toBeUndefined();
    expect(isAgentId("claude")).toBe(true);
  });
});
