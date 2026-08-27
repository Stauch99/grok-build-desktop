export function settingRowVisible(title: string, description: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return title.toLowerCase().includes(q) || description.toLowerCase().includes(q);
}
