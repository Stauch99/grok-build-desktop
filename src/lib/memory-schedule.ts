import { localDayStamp } from "./memory-clock";

function partInZone(ms: number, timeZone: string, part: "hour" | "minute" | "second"): number {
  const raw = new Intl.DateTimeFormat("en-US", {
    timeZone,
    [part]: "numeric",
    ...(part === "hour" ? { hour12: false } : {}),
  }).format(new Date(ms));
  return Number.parseInt(raw, 10);
}

function alignToLocalHour(ms: number, timeZone: string): number {
  const minute = partInZone(ms, timeZone, "minute");
  const second = partInZone(ms, timeZone, "second");
  return ms - minute * 60 * 1000 - second * 1000 - (ms % 1000);
}

export function nextLocalHour(now: number, timeZone: string, hour: number): number {
  let t = now + 60 * 60 * 1000;
  for (let i = 0; i < 48; i++) {
    if (partInZone(t, timeZone, "hour") === hour) {
      const aligned = alignToLocalHour(t, timeZone);
      if (aligned > now) return aligned;
    }
    t += 60 * 60 * 1000;
  }
  return now + 24 * 60 * 60 * 1000;
}

export function armRecurringLocalHour(args: {
  hour: number;
  timeZone: string;
  now: () => number;
  onFire: () => void;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}): () => void {
  let tid: unknown;
  let cleared = false;
  const arm = () => {
    if (cleared) return;
    const now = args.now();
    const delay = Math.max(50, nextLocalHour(now, args.timeZone, args.hour) - now);
    tid = args.setTimeout(() => {
      args.onFire();
      arm();
    }, delay);
  };
  arm();
  return () => {
    cleared = true;
    args.clearTimeout(tid);
  };
}

export function shouldCatchUp(args: { now: number; lastDeepAt: number | null; timeZone: string }): boolean {
  if (args.lastDeepAt == null) return true;
  return localDayStamp(args.lastDeepAt, args.timeZone) < localDayStamp(args.now, args.timeZone);
}
