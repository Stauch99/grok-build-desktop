const KEY = "gbd.telemetry.v1";

export type TelemetryStore = {
  get(key: string): string | number | undefined;
  set(key: string, value: string | number): void;
};

function memoryFallback(): TelemetryStore {
  const data: Record<string, string> = {};
  return {
    get: (k) => data[k],
    set: (k, v) => {
      data[k] = String(v);
    },
  };
}

export function defaultTelemetryStore(): TelemetryStore {
  if (typeof localStorage === "undefined") return memoryFallback();
  return {
    get: (k) => localStorage.getItem(k) ?? undefined,
    set: (k, v) => localStorage.setItem(k, String(v)),
  };
}

export function readLocalEvents(store: TelemetryStore = defaultTelemetryStore()): Record<string, number> {
  const raw = store.get(KEY);
  if (typeof raw !== "string" || !raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function recordLocalEvent(
  enabled: boolean,
  event: string,
  store: TelemetryStore = defaultTelemetryStore(),
): void {
  if (!enabled || !event.trim()) return;
  const next = readLocalEvents(store);
  next[event] = (next[event] ?? 0) + 1;
  store.set(KEY, JSON.stringify(next));
}

export function resetLocalEvents(store: TelemetryStore = defaultTelemetryStore()): void {
  store.set(KEY, "{}");
}
