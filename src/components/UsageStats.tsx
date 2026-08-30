import { useEffect, useMemo, useState, type ReactNode } from "react";
import { readTokenTurns } from "../api";
import { MenuSelect } from "./MenuSelect";
import { IconRefresh } from "../icons";
import { basename } from "../lib/text";
import {
  cacheHitRate,
  filterTurns,
  formatInt,
  formatTokenZh,
  formatUsdFromTicks,
  mapTokenTurnRow,
  summarizeTurns,
  uniqueModels,
  uniqueSources,
  USAGE_BRAND_OPTIONS,
  type TokenTurn,
  type TurnFilter,
  type UsageBrandFilter,
} from "../lib/token-usage";
import { sparklinePoints, splitCostByModel } from "../lib/usage-split";

type DaysKey = "7" | "30" | "all";

function Metric({
  label,
  value,
  icon,
  empty,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="usage-metric">
      <span className="usage-metric-icon" aria-hidden>
        {icon}
      </span>
      <span className="usage-metric-label">{label}</span>
      <strong className={`usage-metric-value${empty ? " empty" : ""}`}>{value}</strong>
    </div>
  );
}

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
  const usageHistory = useMemo(
    () => visible.map((row) => ({ at: row.at, used: row.total })),
    [visible],
  );
  const spark = sparklinePoints(usageHistory, 240, 36);
  const costByModel = useMemo(
    () => splitCostByModel(visible.map((row) => ({ model: row.model, cost: row.costTicks }))),
    [visible],
  );
  const costRows = Object.entries(costByModel).sort((a, b) => b[1] - a[1]);
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

          <div className="usage-metrics">
            <Metric label="新增输入" value={formatTokenZh(sum.newInput)} icon={<IconIn />} />
            <Metric label="Output" value={formatTokenZh(sum.output)} icon={<IconOut />} />
            <Metric
              label="创建"
              value={sum.cacheCreate ? formatTokenZh(sum.cacheCreate) : "N/A"}
              empty={!sum.cacheCreate}
              icon={<IconDb />}
            />
            <Metric label="命中" value={formatTokenZh(sum.cacheRead)} icon={<IconHit />} />
          </div>

          <div className="usage-hit">
            <div className="usage-hit-row">
              <span>缓存命中率</span>
              <strong>{hit == null ? "N/A" : `${hit.toFixed(1)}%`}</strong>
            </div>
            <div className="usage-hit-track" aria-hidden>
              <span style={{ width: `${Math.min(100, hit ?? 0)}%` }} />
            </div>
          </div>

          {spark ? (
            <div className="usage-hit" role="img" aria-label="用量时间序列">
              <svg width="100%" height="36" viewBox="0 0 240 36" preserveAspectRatio="none">
                <polyline fill="none" stroke="currentColor" strokeWidth="1.6" points={spark} />
              </svg>
            </div>
          ) : null}

          {costRows.length > 0 ? (
            <dl className="usage-side">
              {costRows.map(([id, ticks]) => (
                <div key={id}>
                  <dt>{id}</dt>
                  <dd className="usage-cost">{formatUsdFromTicks(ticks)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </article>
      ) : null}
    </div>
  );
}

function IconIn() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 3v7M5.5 8.5 8 11l2.5-2.5M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconOut() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 11V4M5.5 6.5 8 4l2.5 2.5M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconDb() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <ellipse cx="8" cy="4.5" rx="5" ry="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 4.5v7c0 1.1 2.2 2 5 2s5-.9 5-2v-7" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function IconHit() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2.5 9.4 6h3.6L10.5 8.3 11.8 12 8 9.8 4.2 12l1.3-3.7L3 6h3.6L8 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
