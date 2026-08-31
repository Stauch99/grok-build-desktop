import type { AgentId } from "./agent-id";
import { coerceEffort } from "./effort";
import { mergeModelCatalog, modelsFromCache, parseModelsList } from "./models";

export const GROK_FALLBACK_MODELS = ["grok-4.6", "grok-4.5", "grok-build"];
export const GROK_EFFORTS = ["low", "medium", "high", "xhigh"];
export const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultracode"];
export const CLAUDE_FALLBACK_MODELS = ["opus", "sonnet", "haiku", "fable"];

export type SlimModel = {
  id: string;
  label?: string;
  efforts?: string[];
  defaultEffort?: string;
  isDefault?: boolean;
};

export type AgentModelSource = {
  agentId: AgentId;
  grokList?: string | null;
  grokCache?: unknown;
  grokPrefs?: { model?: string; effort?: string } | null;
  kimi?: { currentModel?: string; currentEffort?: string; models?: SlimModel[] } | null;
  claude?: { model?: string; effortLevel?: string } | null;
  codex?: { currentModel?: string; currentEffort?: string; models?: SlimModel[] } | null;
};

export type AgentModelRow = {
  id: string;
  label?: string;
  efforts: string[];
  defaultEffort?: string;
  isDefault?: boolean;
};

export type AgentModelCatalog = {
  agentId: AgentId;
  models: AgentModelRow[];
  currentModel: string;
  currentEffort: string;
};

export function emptyCatalog(agentId: AgentId): AgentModelCatalog {
  if (agentId === "grok") {
    return {
      agentId,
      models: GROK_FALLBACK_MODELS.map((id, i) => ({
        id,
        efforts: [...GROK_EFFORTS],
        isDefault: i === 0,
      })),
      currentModel: GROK_FALLBACK_MODELS[0] ?? "grok-4.6",
      currentEffort: "medium",
    };
  }
  if (agentId === "claude") {
    return {
      agentId,
      models: CLAUDE_FALLBACK_MODELS.map((id, i) => ({
        id,
        efforts: [...CLAUDE_EFFORTS],
        isDefault: i === 0,
      })),
      currentModel: CLAUDE_FALLBACK_MODELS[0] ?? "opus",
      currentEffort: "medium",
    };
  }
  return { agentId, models: [], currentModel: "", currentEffort: "" };
}

export function effortsForModel(models: AgentModelRow[], id: string): string[] {
  return models.find((m) => m.id === id)?.efforts ?? [];
}

export function modelLabelMap(models: AgentModelRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of models) {
    if (row.label && row.label !== row.id) out[row.id] = row.label;
  }
  return out;
}

export function snapModelChange(
  models: AgentModelRow[],
  nextId: string,
  currentEffort: string,
): { model: string; effort: string } {
  const row = models.find((m) => m.id === nextId);
  const efforts = row?.efforts ?? [];
  return {
    model: nextId,
    effort: coerceEffort(currentEffort, efforts, row?.defaultEffort),
  };
}

function withCurrent(
  models: AgentModelRow[],
  current: string,
  efforts: string[],
  defaultEffort?: string,
): AgentModelRow[] {
  const id = current.trim();
  if (!id || models.some((m) => m.id === id)) return models;
  return [{ id, efforts: [...efforts], defaultEffort, isDefault: true }, ...models];
}

function fromSlim(rows: SlimModel[] | undefined, fallbackEfforts: string[]): AgentModelRow[] {
  const out: AgentModelRow[] = [];
  const seen = new Set<string>();
  for (const row of rows ?? []) {
    const id = row.id?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const efforts = (row.efforts ?? []).map((e) => e.trim()).filter(Boolean);
    out.push({
      id,
      label: row.label?.trim() || undefined,
      efforts: efforts.length ? efforts : [...fallbackEfforts],
      defaultEffort: row.defaultEffort?.trim() || undefined,
      isDefault: !!row.isDefault,
    });
  }
  return out;
}

function grokCatalog(source: AgentModelSource): AgentModelCatalog {
  const ids = mergeModelCatalog(
    parseModelsList(source.grokList ?? ""),
    modelsFromCache(source.grokCache),
    GROK_FALLBACK_MODELS,
  );
  const models: AgentModelRow[] = ids.map((id) => ({
    id,
    efforts: [...GROK_EFFORTS],
    defaultEffort: "medium",
  }));
  const currentModel = source.grokPrefs?.model?.trim() || models[0]?.id || GROK_FALLBACK_MODELS[0] || "grok-4.6";
  const currentEffort = coerceEffort(source.grokPrefs?.effort, GROK_EFFORTS, "medium");
  return { agentId: "grok", models: withCurrent(models, currentModel, GROK_EFFORTS), currentModel, currentEffort };
}

function claudeCatalog(source: AgentModelSource): AgentModelCatalog {
  const currentModel = source.claude?.model?.trim() || "";
  const models = withCurrent(
    CLAUDE_FALLBACK_MODELS.map((id) => ({
      id,
      efforts: [...CLAUDE_EFFORTS],
      defaultEffort: "medium",
      isDefault: id === currentModel,
    })),
    currentModel,
    CLAUDE_EFFORTS,
    "medium",
  );
  const picked = currentModel || models[0]?.id || "opus";
  return {
    agentId: "claude",
    models,
    currentModel: picked,
    currentEffort: coerceEffort(source.claude?.effortLevel, CLAUDE_EFFORTS, "medium"),
  };
}

function slimCatalog(
  agentId: AgentId,
  bundle: { currentModel?: string; currentEffort?: string; models?: SlimModel[] } | null | undefined,
  fallbackEfforts: string[],
): AgentModelCatalog {
  const currentModel = bundle?.currentModel?.trim() || "";
  let models = fromSlim(bundle?.models, fallbackEfforts);
  const row = models.find((m) => m.id === currentModel);
  models = withCurrent(models, currentModel, row?.efforts ?? fallbackEfforts, row?.defaultEffort);
  const picked = currentModel || models[0]?.id || "";
  const efforts = effortsForModel(models, picked);
  const fallbackEffort = models.find((m) => m.id === picked)?.defaultEffort;
  return {
    agentId,
    models,
    currentModel: picked,
    currentEffort: coerceEffort(bundle?.currentEffort, efforts, fallbackEffort),
  };
}

export function catalogFromSource(source: AgentModelSource): AgentModelCatalog {
  if (source.agentId === "grok") return grokCatalog(source);
  if (source.agentId === "claude") return claudeCatalog(source);
  if (source.agentId === "kimi") return slimCatalog("kimi", source.kimi, []);
  return slimCatalog("codex", source.codex, []);
}
