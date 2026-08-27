export const DEFAULT_INBOX_NAME = "Grok Chats";

export function normalizeCwd(path: string): string {
  return path.replace(/\/+$/, "");
}

export function sameCwd(a: string, b: string): boolean {
  return normalizeCwd(a) === normalizeCwd(b);
}

export function encodeCwd(cwd: string): string {
  let out = "";
  const bytes = new TextEncoder().encode(cwd);
  for (const b of bytes) {
    if (
      (b >= 48 && b <= 57) ||
      (b >= 65 && b <= 90) ||
      (b >= 97 && b <= 122) ||
      b === 45 ||
      b === 46 ||
      b === 95 ||
      b === 126
    ) {
      out += String.fromCharCode(b);
    } else {
      out += `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}

export function canMoveInboxSession(sourceCwd: string, destCwd: string, inboxCwd: string): string | null {
  if (!sameCwd(sourceCwd, inboxCwd)) return "只能把独立对话移入项目";
  if (sameCwd(destCwd, inboxCwd)) return "目标不能是收件箱";
  if (!destCwd.trim()) return "没有目标项目";
  return null;
}
