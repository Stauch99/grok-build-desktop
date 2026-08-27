import {
  runGrok,
  runGrokStream,
  type GrokRunResult,
} from "../api";

export type McpScope = "user" | "project";
export type McpTransport = "stdio" | "http" | "sse";

export type McpAddInput = {
  name: string;
  transport: McpTransport;
  commandOrUrl?: string;
  args?: string[];
  env?: string[];
  headers?: string[];
  scope?: McpScope;
};

export function mcpAddArgv(input: McpAddInput): string[] {
  const out = ["mcp", "add"];
  if (input.transport !== "stdio") out.push("--transport", input.transport);
  if (input.scope) out.push("--scope", input.scope);
  for (const env of input.env ?? []) out.push("-e", env);
  for (const header of input.headers ?? []) out.push("--header", header);
  out.push(input.name);
  if (input.commandOrUrl) {
    if (input.transport === "stdio") {
      out.push("--", input.commandOrUrl, ...(input.args ?? []));
    } else {
      out.push(input.commandOrUrl);
    }
  }
  return out;
}

export async function grokMcpList(cwd?: string | null): Promise<GrokRunResult> {
  return runGrok(["mcp", "list", "--json"], cwd);
}

export async function grokMcpDoctor(name?: string, cwd?: string | null): Promise<GrokRunResult> {
  const args = name ? ["mcp", "doctor", name, "--json"] : ["mcp", "doctor", "--json"];
  return runGrok(args, cwd);
}

export async function grokMcpAdd(input: McpAddInput, cwd?: string | null): Promise<GrokRunResult> {
  return runGrok(mcpAddArgv(input), cwd);
}

export async function grokMcpEnable(name: string, cwd?: string | null): Promise<GrokRunResult> {
  return runGrok(["mcp", "enable", name], cwd);
}

export async function grokMcpDisable(name: string, cwd?: string | null): Promise<GrokRunResult> {
  return runGrok(["mcp", "disable", name], cwd);
}

export async function grokMcpRemove(name: string, scope?: McpScope, cwd?: string | null): Promise<GrokRunResult> {
  const args = ["mcp", "remove", name];
  if (scope) args.push("--scope", scope);
  return runGrok(args, cwd);
}

export async function grokPluginList(cwd?: string | null): Promise<GrokRunResult> {
  return runGrok(["plugin", "list", "--json"], cwd);
}

export async function grokPluginDetails(name: string, cwd?: string | null): Promise<GrokRunResult> {
  return runGrok(["plugin", "details", name], cwd);
}

export async function grokPluginEnable(name: string, cwd?: string | null): Promise<GrokRunResult> {
  return runGrok(["plugin", "enable", name], cwd);
}

export async function grokPluginDisable(name: string, cwd?: string | null): Promise<GrokRunResult> {
  return runGrok(["plugin", "disable", name], cwd);
}

export async function grokPluginUninstall(name: string, cwd?: string | null): Promise<GrokRunResult> {
  return runGrok(["plugin", "uninstall", name, "--confirm"], cwd);
}

export async function grokMarketplaceList(cwd?: string | null): Promise<GrokRunResult> {
  return runGrok(["plugin", "marketplace", "list"], cwd);
}

export async function grokMarketplaceAdd(source: string, cwd?: string | null): Promise<GrokRunResult> {
  return runGrok(["plugin", "marketplace", "add", source], cwd);
}

export async function grokMarketplaceRemove(source: string, cwd?: string | null): Promise<GrokRunResult> {
  return runGrok(["plugin", "marketplace", "remove", source], cwd);
}

export async function grokMarketplaceUpdate(name?: string, cwd?: string | null): Promise<GrokRunResult> {
  const args = name
    ? ["plugin", "marketplace", "update", name]
    : ["plugin", "marketplace", "update"];
  return runGrok(args, cwd);
}

export function grokPluginInstall(source: string, trust: boolean, cwd?: string | null) {
  const args = ["plugin", "install", source];
  if (trust) args.push("--trust");
  return runGrokStream(args, cwd);
}

export function grokMcpDoctorStream(cwd?: string | null) {
  return runGrokStream(["mcp", "doctor"], cwd);
}

export function parseJsonList<T>(stdout: string): T[] {
  const text = stdout.trim();
  if (!text) return [];
  try {
    const v = JSON.parse(text) as unknown;
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

export function parseJsonObject<T extends object>(stdout: string): T | null {
  const text = stdout.trim();
  if (!text) return null;
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as T) : null;
  } catch {
    return null;
  }
}
