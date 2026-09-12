export function userMdPath(memoryRoot: string): string {
  return `${memoryRoot.replace(/\/+$/, "")}/USER.md`;
}

export function dreamsMdPath(memoryRoot: string): string {
  return `${memoryRoot.replace(/\/+$/, "")}/DREAMS.md`;
}

export const DAILY_MAX_SHARDS = 8;

export function dailyShardPath(memoryRoot: string, day: string, index: number): string {
  if (!Number.isInteger(index) || index < 1 || index > DAILY_MAX_SHARDS) {
    throw new Error("invalid daily shard");
  }
  const root = memoryRoot.replace(/\/+$/, "");
  if (index === 1) return `${root}/daily/${day}.md`;
  return `${root}/daily/${day}.${index}.md`;
}

export function dailyMdPath(memoryRoot: string, day: string): string {
  return dailyShardPath(memoryRoot, day, 1);
}

export function memoryStatePath(memoryRoot: string): string {
  return `${memoryRoot.replace(/\/+$/, "")}/.dreams/state.json`;
}

export const FOUNDING_MAX_EPISODE_SHARDS = 8;

export function foundingEpisodePath(memoryRoot: string, index: number): string {
  if (!Number.isInteger(index) || index < 1 || index > FOUNDING_MAX_EPISODE_SHARDS) {
    throw new Error("invalid founding episode shard");
  }
  return `${memoryRoot.replace(/\/+$/, "")}/.dreams/founding/_episodes.${index}.md`;
}

export function foundingDomainPath(memoryRoot: string, domain: string): string {
  const safe = domain.replace(/[^A-Za-z0-9._-]+/g, "_");
  return `${memoryRoot.replace(/\/+$/, "")}/.dreams/founding/${safe || "other"}.md`;
}

export function skillProposalPath(memoryRoot: string, id: string): string {
  const safe = id.replace(/[^A-Za-z0-9._-]+/g, "_");
  return `${memoryRoot.replace(/\/+$/, "")}/skill-proposals/${safe}.md`;
}
