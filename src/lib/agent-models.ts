import type { AgentId } from "./agent-id";
import { coerceEffort } from "./effort";
import { mergeModelCatalog, modelsFromCache, parseModelsList } from "./models";

export const GROK_FALLBACK_MODELS = ["grok-4.6", "grok-4.5", "grok-build"];
export const GROK_EFFORTS = ["low", "medium", "high", "xhigh"];
export const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultracode"];
export const CLAUDE_FALLBACK_MODELS = ["opus", "sonnet", "haiku", "fable"];
// Static fallback for the Devin picker before a session is live. Once a
// session opens, session/new configOptions replace this with the real
// account-scoped catalog (same data as the CLI `/model` picker). Ids are the
// canonical model_uids; fuzzy family slugs also resolve server-side.
export const DEVIN_MODELS: SlimModel[] = [
  { id: "adaptive", label: "Adaptive", group: "Recommended", description: "按任务自动路由到最优模型", isDefault: true },
  { id: "fusion", label: "Fusion", group: "Recommended", description: "前沿主模型 + 低成本副模型配对" },
  { id: "swe-1-6-fast", label: "SWE 1.6 Fast", group: "Cognition", description: "快且省，适合常规修改与问答" },
  { id: "swe-1-6", label: "SWE 1.6", group: "Cognition" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", group: "Anthropic", description: "深度推理与多文件重构" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", group: "Anthropic" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", group: "Anthropic", description: "轻量快速" },
  { id: "gpt-5.4", label: "GPT-5.4", group: "OpenAI" },
  { id: "gpt-5.3-codex", label: "GPT-5.3 Codex", group: "OpenAI", description: "面向代码任务" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", group: "Google" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", group: "Google", description: "轻量快速" },
  { id: "kimi-k3", label: "Kimi K3", group: "Open models" },
  { id: "glm-5-3", label: "GLM 5.3", group: "Open models" },
];

export type SlimModel = {
  id: string;
  label?: string;
  description?: string;
  group?: string;
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
  devin?: { currentModel?: string; currentEffort?: string; models?: SlimModel[] } | null;
};

export type AgentModelRow = {
  id: string;
  label?: string;
  description?: string;
  group?: string;
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
  if (agentId === "devin") {
    return devinCatalog({ agentId });
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
      description: row.description?.trim() || undefined,
      group: row.group?.trim() || undefined,
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

function devinCatalog(source: AgentModelSource): AgentModelCatalog {
  const live = source.devin?.models;
  const currentModel = source.devin?.currentModel?.trim() || "adaptive";
  const models = withCurrent(fromSlim(live?.length ? live : DEVIN_MODELS, []), currentModel, []);
  const efforts = effortsForModel(models, currentModel);
  return {
    agentId: "devin",
    models,
    currentModel,
    currentEffort: coerceEffort(source.devin?.currentEffort, efforts, undefined) || "",
  };
}

export function catalogFromSource(source: AgentModelSource): AgentModelCatalog {
  if (source.agentId === "grok") return grokCatalog(source);
  if (source.agentId === "claude") return claudeCatalog(source);
  if (source.agentId === "kimi") return slimCatalog("kimi", source.kimi, []);
  if (source.agentId === "devin") return devinCatalog(source);
  return slimCatalog("codex", source.codex, []);
}
