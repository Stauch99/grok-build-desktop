import { asRecord } from "./text";

export type WeeklyUsage = {
  percent: number;
  periodEnd?: number;
  tier?: string;
};

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function dateMs(v: unknown): number | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : undefined;
}

/** `_x.ai/billing` → the weekly credit window `/usage` shows. */
export function parseWeeklyUsage(raw: unknown): WeeklyUsage | null {
  const rec = asRecord(raw);
  const config = asRecord(rec.config);
  const percent = num(config.creditUsagePercent);
  if (percent == null) return null;
  const period = asRecord(config.currentPeriod);
  const periodEnd = dateMs(period.end) ?? dateMs(config.billingPeriodEnd);
  const tier = typeof rec.subscription_tier === "string" ? rec.subscription_tier : undefined;
  const next: WeeklyUsage = {
    percent: Math.max(0, Math.min(100, percent)),
  };
  if (periodEnd != null) next.periodEnd = periodEnd;
  if (tier) next.tier = tier;
  return next;
}

export function weeklyResetLabel(periodEnd?: number, now = Date.now()): string | undefined {
  if (periodEnd == null || !Number.isFinite(periodEnd)) return undefined;
  if (periodEnd - now <= 0) return "即将重置";
  const d = new Date(periodEnd);
  return `${d.getMonth() + 1}月${d.getDate()}日重置`;
}

export type WeeklyUsageCopy = {
  title: string;
  detail?: string;
  percent?: number;
};

export function weeklyUsageCopy(
  usage: WeeklyUsage | null,
  signedIn: boolean,
  now = Date.now(),
): WeeklyUsageCopy {
  if (!signedIn) return { title: "未登录" };
  if (!usage) return { title: "已登录" };
  const percent = Math.round(usage.percent);
  const detail = weeklyResetLabel(usage.periodEnd, now);
  const copy: WeeklyUsageCopy = {
    title: `周用量 ${percent}%`,
    percent,
  };
  if (detail) copy.detail = detail;
  return copy;
}
