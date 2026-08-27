export type ModelRow = { id: string; label?: string; isDefault?: boolean };

/** Parse `grok models` human output. Lines look like `* grok-4.6 (default)` or `- grok-4.5`. */
export function parseModelsList(text: string): ModelRow[] {
  const out: ModelRow[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*[*+-]\s+([A-Za-z0-9._:-]+)/.exec(line);
    if (!m) continue;
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      isDefault: line.includes("(default)") || line.trim().startsWith("*"),
    });
  }
  return out;
}

export function modelsFromCache(json: unknown): ModelRow[] {
  if (!json || typeof json !== "object") return [];
  const models = (json as { models?: Record<string, { info?: { id?: string; name?: string; hidden?: boolean } }> })
    .models;
  if (!models || typeof models !== "object") return [];
  const out: ModelRow[] = [];
  for (const [id, row] of Object.entries(models)) {
    if (row?.info?.hidden) continue;
    out.push({ id: row?.info?.id || id, label: row?.info?.name });
  }
  return out;
}

export function mergeModelCatalog(cli: ModelRow[], cache: ModelRow[], fallback: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of [...cli, ...cache]) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row.id);
  }
  for (const id of fallback) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
