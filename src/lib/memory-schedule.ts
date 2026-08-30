import { localDayStamp } from "./memory-clock";

function hourInZone(ms: number, timeZone: string): number {
  const raw = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).format(new Date(ms));
  return Number.parseInt(raw, 10);
}

export function nextLocalHour(now: number, timeZone: string, hour: number): number {
  let t = now + 60 * 60 * 1000;
  for (let i = 0; i < 48; i++) {
    if (hourInZone(t, timeZone) === hour) {
      const floored = t - (t % (60 * 60 * 1000));
      return floored;
    }
    t += 60 * 60 * 1000;
  }
  return now + 24 * 60 * 60 * 1000;
}

export function shouldCatchUp(args: { now: number; lastDeepAt: number | null; timeZone: string }): boolean {
  if (args.lastDeepAt == null) return true;
  return localDayStamp(args.lastDeepAt, args.timeZone) < localDayStamp(args.now, args.timeZone);
}
