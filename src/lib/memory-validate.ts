export const USER_MD_MAX_BYTES = 8 * 1024;
export const USER_MD_MAX_LOSS = 0.2;

export function parseUserMdEntries(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

export function validateUserMdRewrite(
  prev: string,
  next: string,
): { ok: true } | { ok: false; reason: "loss" | "source" | "budget" | "shape" } {
  if (new TextEncoder().encode(next).length > USER_MD_MAX_BYTES) return { ok: false, reason: "budget" };
  if (!/^# /m.test(next) || !/^- /m.test(next)) return { ok: false, reason: "shape" };
  const before = parseUserMdEntries(prev);
  const after = parseUserMdEntries(next);
  if (before.length > 0) {
    const kept = before.filter((e) => after.some((a) => a.includes(e) || e.includes(a))).length;
    if (kept / before.length < 1 - USER_MD_MAX_LOSS) return { ok: false, reason: "loss" };
  }
  const prevSet = new Set(before);
  for (const line of after) {
    if (prevSet.has(line)) continue;
    if (!/Source:\s*\S/.test(line)) return { ok: false, reason: "source" };
  }
  return { ok: true };
}

export function applyUserMdRewrite(
  prev: string,
  next: string,
): { file: string; preimage: string; rejected?: true } {
  const check = validateUserMdRewrite(prev, next);
  if (!check.ok) return { file: prev, preimage: prev, rejected: true };
  return { file: next, preimage: prev };
}
