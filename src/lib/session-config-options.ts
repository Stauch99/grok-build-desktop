// Parses the ACP `configOptions` array returned by session/new and session/load.
// Devin advertises its real, account-scoped model catalog through a "model"
// config option whose select options may be grouped by family — the same data
// the CLI `/model` picker renders.

export type SessionConfigSelectOption = {
  value: string;
  name: string;
  description?: string;
};

export type SessionConfigOption = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  type?: string;
  currentValue?: string;
  options: SessionConfigSelectOption[];
  groups?: { name: string; options: SessionConfigSelectOption[] }[];
};

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

function selectOption(raw: unknown): SessionConfigSelectOption | null {
  if (!isObj(raw)) return null;
  const value = typeof raw.value === "string" ? raw.value : "";
  if (!value) return null;
  return {
    value,
    name: typeof raw.name === "string" && raw.name ? raw.name : value,
    description: typeof raw.description === "string" ? raw.description : undefined,
  };
}

function optionFrom(raw: unknown): SessionConfigOption | null {
  if (!isObj(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!id) return null;
  const out: SessionConfigOption = {
    id,
    name: typeof raw.name === "string" && raw.name ? raw.name : id,
    description: typeof raw.description === "string" ? raw.description : undefined,
    category: typeof raw.category === "string" ? raw.category : undefined,
    type: typeof raw.type === "string" ? raw.type : undefined,
    currentValue: typeof raw.currentValue === "string" ? raw.currentValue : undefined,
    options: [],
  };
  const opts = raw.options;
  if (Array.isArray(opts)) {
    for (const o of opts) {
      const parsed = selectOption(o);
      if (parsed) out.options.push(parsed);
    }
    return out;
  }
  if (isObj(opts)) {
    const grouped = Array.isArray(opts.grouped) ? opts.grouped : Array.isArray(opts.groups) ? opts.groups : [];
    for (const g of grouped) {
      if (!isObj(g)) continue;
      const gname = typeof g.group === "string" ? g.group : typeof g.name === "string" ? g.name : "";
      const items = Array.isArray(g.options) ? g.options : [];
      const parsed: SessionConfigSelectOption[] = [];
      for (const o of items) {
        const p = selectOption(o);
        if (p) parsed.push(p);
      }
      if (parsed.length) {
        (out.groups ??= []).push({ name: gname, options: parsed });
        out.options.push(...parsed);
      }
    }
    const ungrouped = Array.isArray(opts.ungrouped) ? opts.ungrouped : [];
    for (const o of ungrouped) {
      const p = selectOption(o);
      if (p) out.options.push(p);
    }
  }
  return out;
}

export function parseSessionConfigOptions(result: unknown): SessionConfigOption[] {
  if (!isObj(result)) return [];
  const list = Array.isArray(result.configOptions) ? result.configOptions : [];
  const out: SessionConfigOption[] = [];
  for (const raw of list) {
    const o = optionFrom(raw);
    if (o) out.push(o);
  }
  return out;
}

export function modelConfigOption(list: SessionConfigOption[]): SessionConfigOption | null {
  return (
    list.find((o) => o.category === "model" || o.id === "model" || /model/i.test(o.id)) ?? null
  );
}

export function thoughtLevelConfigOption(list: SessionConfigOption[]): SessionConfigOption | null {
  return list.find((o) => o.category === "thought_level" || /thought|effort/i.test(o.id)) ?? null;
}
