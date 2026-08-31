import { useEffect, useMemo, useState } from "react";
import { readTokenTurns } from "../api";
import { MenuSelect } from "./MenuSelect";
import { IconRefresh } from "../icons";
import { basename } from "../lib/text";
import {
  cacheHitRate,
  chartBarPx,
  dailyUsageBars,
  dayBarTip,
  filterTurns,
  formatChartTick,
  formatInt,
  formatTokenZh,
  formatUsdFromTicks,
  isTodayBar,
  mapTokenTurnRow,
  modelCostRows,
  summarizeTurns,
  uniqueModels,
  uniqueSources,
  usageMixShares,
  USAGE_BRAND_OPTIONS,
  type TokenTurn,
  type TurnFilter,
  type UsageBrandFilter,
} from "../lib/token-usage";
import { splitCostByModel } from "../lib/usage-split";

type DaysKey = "7" | "30" | "all";

const CHART_PLOT_PX = 128;

export function UsageStats() {
  const [turns, setTurns] = useState<TokenTurn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<DaysKey>("7");
  const [brand, setBrand] = useState<UsageBrandFilter>("all");
  const [model, setModel] = useState("");
  const [cwd, setCwd] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const rows = await readTokenTurns();
      setTurns((Array.isArray(rows) ? rows : []).map(mapTokenTurnRow));
    } catch (reason) {
      setError(String(reason));
      setTurns([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const models = useMemo(() => uniqueModels(turns), [turns]);
  const sources = useMemo(() => uniqueSources(turns), [turns]);
  const filter: TurnFilter = {
    days: days === "all" ? 0 : days === "30" ? 30 : 7,
    agentId: brand,
    model: model || undefined,
    cwd: cwd || undefined,
  };
  const visible = useMemo(() => filterTurns(turns, filter), [turns, days, brand, model, cwd]);
  const sum = useMemo(() => summarizeTurns(visible), [visible]);
  const hit = cacheHitRate(sum);
  const mix = useMemo(() => usageMixShares(sum), [sum]);
  const dayCount = days === "all" ? 0 : days === "30" ? 30 : 7;
  const bars = useMemo(
    () => dailyUsageBars(visible, dayCount),
    [visible, dayCount],
  );
  const barMax = Math.max(0, ...bars.map((b) => b.used));
  const costByModel = useMemo(
    () => splitCostByModel(visible.map((row) => ({ model: row.model, cost: row.costTicks }))),
    [visible],
  );
  const costRows = useMemo(() => modelCostRows(costByModel), [costByModel]);
  const chartLabel = days === "30" ? "近 30 天" : days === "all" ? "近 30 天" : "近 7 天";
  const rangeLabel = days === "30" ? "近 30 天" : days === "all" ? "全部记录" : "近 7 天";
  const brandLabel =
    brand === "all"
      ? "Grok Build"
      : (USAGE_BRAND_OPTIONS.find((o) => o.value === brand)?.label ?? brand);
  const factCols = 3 + (sum.cacheCreate > 0 ? 1 : 0);
  const mixLabel = [
    `缓存 ${mix.cacheRead}%`,
    `新增输入 ${mix.newInput}%`,
    `输出 ${mix.output}%`,
    mix.cacheCreate > 0 ? `缓存写入 ${mix.cacheCreate}%` : "",
  ].filter(Boolean).join("，");

  return (
    <div className="usage-stats">
      <div className="usage-toolbar">
        <div className="usage-toolbar-filters">
          <MenuSelect
            variant="inline"
            ariaLabel="CLI"
            value={brand}
            onChange={setBrand}
            options={USAGE_BRAND_OPTIONS}
          />
          <MenuSelect
            variant="inline"
            ariaLabel="来源"
            value={cwd || "*"}
            onChange={(next) => setCwd(next === "*" ? "" : next)}
            options={[
              { value: "*", label: "全部来源" },
              ...sources.map((path) => ({ value: path, label: basename(path) || path })),
            ]}
          />
          <MenuSelect
            variant="inline"
            ariaLabel="模型"
            value={model || "*"}
            onChange={(next) => setModel(next === "*" ? "" : next)}
            options={[
              { value: "*", label: "全部模型" },
              ...models.map((id) => ({ value: id, label: id })),
            ]}
          />
        </div>
        <div className="usage-toolbar-range">
          <button type="button" className="icon-btn" onClick={() => void load()} disabled={loading} title="刷新" aria-label="刷新">
            <IconRefresh size={16} />
          </button>
          <MenuSelect
            variant="inline"
            ariaLabel="时间范围"
            value={days}
            onChange={setDays}
            options={[
              { value: "7", label: "7 天" },
              { value: "30", label: "30 天" },
              { value: "all", label: "全部" },
            ]}
          />
        </div>
      </div>

      {error ? <p className="float-empty">{error}</p> : null}
      {loading && turns.length === 0 ? <p className="float-empty">正在读取用量…</p> : null}
      {!loading && !error && turns.length === 0 ? <p className="float-empty">还没有 token 用量记录。</p> : null}

      {turns.length > 0 ? (
        <article className="usage-card">
          <header className="usage-hero">
            <div className="usage-hero-main">
              <p className="usage-kicker">{brandLabel} · {rangeLabel}</p>
              <p className="usage-hero-tokens">
                <strong>{formatTokenZh(sum.total)}</strong>
                <span>{formatInt(sum.total)} tokens</span>
              </p>
            </div>
            <dl className="usage-hero-kpis">
              <div>
                <dt>成本</dt>
                <dd className="usage-cost">{formatUsdFromTicks(sum.costTicks)}</dd>
              </div>
              <div>
                <dt>请求</dt>
                <dd>{formatInt(sum.requests)}</dd>
              </div>
            </dl>
          </header>

          <div className="usage-mix" role="img" aria-label={`Token 构成：${mixLabel}`}>
            <div className="usage-mix-head">
              <span>构成</span>
              <strong>{hit == null ? "命中率 N/A" : `命中率 ${hit.toFixed(1)}%`}</strong>
            </div>
            <div className="usage-mix-track" aria-hidden>
              {mix.cacheRead > 0 ? <span className="usage-mix-cache" style={{ width: `${mix.cacheRead}%` }} /> : null}
              {mix.newInput > 0 ? <span className="usage-mix-new" style={{ width: `${mix.newInput}%` }} /> : null}
              {mix.output > 0 ? <span className="usage-mix-out" style={{ width: `${mix.output}%` }} /> : null}
              {mix.cacheCreate > 0 ? <span className="usage-mix-write" style={{ width: `${mix.cacheCreate}%` }} /> : null}
            </div>
            <dl className="usage-facts" data-cols={factCols}>
              <div data-tone="new">
                <dt>新增输入</dt>
                <dd>{formatTokenZh(sum.newInput)}</dd>
                <span>{mix.newInput}%</span>
              </div>
              <div data-tone="out">
                <dt>输出</dt>
                <dd>{formatTokenZh(sum.output)}</dd>
                <span>{mix.output}%</span>
              </div>
              {sum.cacheCreate > 0 ? (
                <div data-tone="write">
                  <dt>缓存写入</dt>
                  <dd>{formatTokenZh(sum.cacheCreate)}</dd>
                  <span>{mix.cacheCreate}%</span>
                </div>
              ) : null}
              <div data-tone="cache">
                <dt>缓存命中</dt>
                <dd>{formatTokenZh(sum.cacheRead)}</dd>
                <span>{mix.cacheRead}%</span>
              </div>
            </dl>
          </div>

          {bars.some((b) => b.used > 0) ? (
            <figure className="usage-chart">
              <figcaption>
                <span>{chartLabel}</span>
                <span>峰值 {formatTokenZh(barMax)}</span>
              </figcaption>
              <div
                className="usage-chart-plot"
                data-dense={bars.length > 10 || undefined}
                role="list"
                aria-label={`${chartLabel}每日用量`}
              >
                {bars.map((b) => {
                  const h = chartBarPx(b.used, barMax, CHART_PLOT_PX);
                  const tip = dayBarTip(b);
                  const today = isTodayBar(b.at);
                  const empty = b.used <= 0;
                  return (
                    <button
                      key={b.at}
                      type="button"
                      className={`usage-chart-col${today ? " usage-chart-col-today" : ""}${empty ? " usage-chart-col-empty" : ""}`}
                      aria-label={tip}
                    >
                      <span className="usage-chart-bar" style={{ height: `${empty ? 2 : h}px` }} />
                      <span className="usage-chart-tip">{tip}</span>
                    </button>
                  );
                })}
              </div>
              <div className="usage-chart-axis" aria-hidden>
                {bars.map((b, i) => (
                  <span key={b.at}>{formatChartTick(i, bars.length, b.at)}</span>
                ))}
              </div>
            </figure>
          ) : null}

          {costRows.length > 0 ? (
            <div className="usage-models-block">
              <p className="usage-models-head">按模型</p>
              <ul className="usage-models">
              {costRows.map((row) => (
                <li key={row.id}>
                  <div className="usage-model-top">
                    <span title={row.id}>{row.id}</span>
                    <strong className="usage-cost">{formatUsdFromTicks(row.ticks)}</strong>
                  </div>
                  <div className="usage-model-track" aria-hidden>
                    <span style={{ width: `${Math.max(row.share, row.ticks > 0 ? 4 : 0)}%` }} />
                  </div>
                </li>
              ))}
              </ul>
            </div>
          ) : null}
        </article>
      ) : null}
    </div>
  );
}
