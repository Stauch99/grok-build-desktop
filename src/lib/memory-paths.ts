export function userMdPath(memoryRoot: string): string {
  return `${memoryRoot.replace(/\/+$/, "")}/USER.md`;
}

export function dreamsMdPath(memoryRoot: string): string {
  return `${memoryRoot.replace(/\/+$/, "")}/DREAMS.md`;
}

export function dailyMdPath(memoryRoot: string, day: string): string {
  return `${memoryRoot.replace(/\/+$/, "")}/daily/${day}.md`;
}

export function memoryStatePath(memoryRoot: string): string {
  return `${memoryRoot.replace(/\/+$/, "")}/.dreams/state.json`;
}
