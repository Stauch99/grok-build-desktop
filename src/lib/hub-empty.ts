export type HubEmptyKind = "skills" | "mcp" | "plugins" | "market" | "market-fail" | "search";

export function hubEmptyKind(input: {
  tab: "skills" | "mcp" | "plugins" | "marketplace" | "hooks";
  query: string;
  count: number;
  marketFailed?: boolean;
}): HubEmptyKind | null {
  if (input.count > 0) return null;
  if (input.query.trim()) return "search";
  if (input.tab === "marketplace") return input.marketFailed ? "market-fail" : "market";
  if (input.tab === "skills") return "skills";
  if (input.tab === "mcp") return "mcp";
  if (input.tab === "plugins") return "plugins";
  return null;
}
