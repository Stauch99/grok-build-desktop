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
  summarizeTurns,
  uniqueModels,
  uniqueSources,
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
  const costRows = Object.entries(costByModel).sort((a, b) => b[1] - a[1]);
  const chartLabel = days === "30" ? "近 30 天" : days === "all" ? "近 30 天" : "近 7 天";
  const brandLabel =
    brand === "all"
      ? "Grok Build"
      : (USAGE_BRAND_OPTIONS.find((o) => o.value === brand)?.label ?? brand);

  return (
    <div className="usage-stats">
      <div className="usage-toolbar">
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

      {error ? <p className="float-empty">{error}</p> : null}
      {loading && turns.length === 0 ? <p className="float-empty">正在读取用量…</p> : null}
      {!loading && !error && turns.length === 0 ? <p className="float-empty">还没有 token 用量记录。</p> : null}

      {turns.length > 0 ? (
        <article className="usage-card">
          <header className="usage-card-head">
            <div>
              <p className="usage-kicker">{brandLabel} · 真实消耗 Tokens</p>
              <p className="usage-total">
                <strong>{formatInt(sum.total)}</strong>
                <span>≈ {formatTokenZh(sum.total)}</span>
              </p>
            </div>
            <dl className="usage-side">
              <div>
                <dt>总请求数</dt>
                <dd>{formatInt(sum.requests)}</dd>
              </div>
              <div>
                <dt>总成本</dt>
                <dd className="usage-cost">{formatUsdFromTicks(sum.costTicks)}</dd>
              </div>
            </dl>
          </header>

          <dl className="usage-facts">
            <div>
              <dt>新增输入</dt>
              <dd>{formatTokenZh(sum.newInput)}</dd>
            </div>
            <div>
              <dt>输出</dt>
              <dd>{formatTokenZh(sum.output)}</dd>
            </div>
            {sum.cacheCreate > 0 ? (
              <div>
                <dt>缓存写入</dt>
                <dd>{formatTokenZh(sum.cacheCreate)}</dd>
              </div>
            ) : null}
            <div>
              <dt>缓存命中</dt>
              <dd>{formatTokenZh(sum.cacheRead)}</dd>
            </div>
          </dl>

          <div className="usage-hit">
            <div className="usage-hit-row">
              <span>缓存命中率</span>
              <strong>{hit == null ? "N/A" : `${hit.toFixed(1)}%`}</strong>
            </div>
            <div className="usage-hit-track" aria-hidden>
              <span style={{ width: `${Math.min(100, hit ?? 0)}%` }} />
            </div>
          </div>

          {bars.some((b) => b.used > 0) ? (
            <figure className="usage-chart">
              <figcaption>
                <span>{chartLabel}</span>
                <span>峰值 {formatTokenZh(barMax)}</span>
              </figcaption>
              <div className="usage-chart-plot" role="list" aria-label={`${chartLabel}每日用量`}>
                {bars.map((b) => {
                  const h = chartBarPx(b.used, barMax, CHART_PLOT_PX);
                  const tip = dayBarTip(b);
                  const today = isTodayBar(b.at);
                  return (
                    <button
                      key={b.at}
                      type="button"
                      className={`usage-chart-col${today ? " usage-chart-col-today" : ""}`}
                      aria-label={tip}
                    >
                      <span className="usage-chart-bar" style={{ height: `${h}px` }} />
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
              <p className="usage-chart-note">柱高 = tokens，金额见悬停</p>
            </figure>
          ) : null}

          {costRows.length > 0 ? (
            <ul className="usage-models">
              {costRows.map(([id, ticks]) => (
                <li key={id}>
                  <span title={id}>{id}</span>
                  <strong className="usage-cost">{formatUsdFromTicks(ticks)}</strong>
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      ) : null}
    </div>
  );
}
