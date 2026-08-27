export type PaneMentionData = { cwd: string; dirs: string[]; changes: string[] };
export type PaneMentionSource = { dirs: string[]; changes: string[] };
export function selectPaneMentionSource(cwd: string, data: PaneMentionData | null): PaneMentionSource {
  return data && data.cwd === cwd ? { dirs: data.dirs, changes: data.changes } : { dirs: [], changes: [] };
}
