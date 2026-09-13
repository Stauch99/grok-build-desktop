export function pickFoundingKimiModel(catalogIds: readonly string[]): string | null {
  const ids = catalogIds.map((id) => id.trim()).filter(Boolean);
  if (ids.includes("kimi-code/k3")) return "kimi-code/k3";
  if (ids.includes("k3")) return "k3";
  return ids.find((id) => /k3/i.test(id) && !/256k|k2/i.test(id)) ?? null;
}
