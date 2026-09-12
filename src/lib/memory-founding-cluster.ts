export const FOUNDING_ONE_SHOT_CHARS = 400_000;
export const FOUNDING_MAX_DOMAINS = 12;

export function domainKey(cwd: string): string {
  const normalized = cwd.replace(/\\/g, "/").replace(/\/\.worktrees\/[^/]+/g, "");
  if (normalized.includes("GlobalEdu")) return "GlobalEdu";
  if (normalized.includes("grok_build_desktop")) return "grok_build_desktop";
  if (normalized.includes("Beldore_edu_planner")) return "Beldore_edu_planner";
  if (normalized.includes("HKUST") || normalized.includes("30_Academic")) return "30_Academic";
  if (normalized.includes("Writing Projects") || normalized.includes("writing-projects")) return "writing-projects";
  if (normalized.includes("40_Finance")) return "40_Finance";
  if (normalized.includes("LoveLife")) return "LoveLife";
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || "other";
}

export function clusterEpisodes<T extends { cwd: string }>(lines: readonly T[]): { domain: string; lines: T[] }[] {
  const buckets = new Map<string, T[]>();
  for (const line of lines) {
    const key = domainKey(line.cwd);
    const list = buckets.get(key) ?? [];
    list.push(line);
    buckets.set(key, list);
  }
  const groups = [...buckets.entries()]
    .map(([domain, groupLines]) => ({ domain, lines: groupLines }))
    .sort((a, b) => b.lines.length - a.lines.length || a.domain.localeCompare(b.domain));
  if (groups.length <= FOUNDING_MAX_DOMAINS) return groups;
  const keep = groups.slice(0, FOUNDING_MAX_DOMAINS - 1);
  const rest = groups.slice(FOUNDING_MAX_DOMAINS - 1);
  const otherLines = rest.flatMap((g) => g.lines);
  keep.push({ domain: "other", lines: otherLines });
  return keep;
}

export function shouldFoundingOneShot(packedChars: number): boolean {
  return packedChars <= FOUNDING_ONE_SHOT_CHARS;
}
