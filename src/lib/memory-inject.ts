export const USER_MD_COMPACT_LIMIT = 4000;

export function compactUserMd(text: string, limit = USER_MD_COMPACT_LIMIT): string {
  const src = text.replace(/\s+$/u, "") + (text.endsWith("\n") ? "\n" : "");
  if (src.length <= limit) return text;
  const parts = src.split(/\n(?=# )/u);
  let out = "";
  for (const part of parts) {
    const next = out ? `${out}\n${part}` : part;
    if (next.length > limit) break;
    out = next;
  }
  if (!out) out = src.slice(0, limit);
  return out;
}

export type WrapFirstPromptInput = {
  sessionId: string;
  alreadyInjected: boolean;
  injectOn: boolean;
  userMd: string | null;
  userText: string;
};

export type WrapFirstPromptResult = { text: string; injected: boolean };

export function wrapFirstPrompt(input: WrapFirstPromptInput): WrapFirstPromptResult {
  if (input.alreadyInjected || !input.injectOn) return { text: input.userText, injected: false };
  const compact = compactUserMd((input.userMd ?? "").trim());
  if (!compact) return { text: input.userText, injected: false };
  return { text: `<user-memory>\n${compact}\n</user-memory>\n\n${input.userText}`, injected: true };
}

export function resolveOutgoingPrompt(input: WrapFirstPromptInput): WrapFirstPromptResult {
  if (input.userText.startsWith("/")) return { text: input.userText, injected: false };
  return wrapFirstPrompt(input);
}

export function stripInjectedMemory(text: string): string {
  const closed = text.replace(/<user-memory>[\s\S]*?<\/user-memory>\s*/gi, "").trim();
  if (closed !== text.trim()) return closed;
  if (!/<user-memory>/i.test(text)) return text;
  const lines = text.replace(/^<user-memory>\s*/i, "").split(/\n/);
  let i = 0;
  if (lines[i]?.trim() === "# You") i += 1;
  while (i < lines.length) {
    const row = lines[i] ?? "";
    if (row.trim() === "" || row.startsWith("- ")) {
      i += 1;
      continue;
    }
    break;
  }
  return lines.slice(i).join("\n").trim();
}

export type SplitInjectedMemory = { visible: string; injected: string | null };

export function splitInjectedMemory(text: string): SplitInjectedMemory {
  if (!/<user-memory>/i.test(text)) return { visible: text, injected: null };
  const visible = stripInjectedMemory(text);
  const closed = text.match(/<user-memory>([\s\S]*?)<\/user-memory>/i);
  if (closed) return { visible, injected: closed[1].trim() || null };
  const withoutTag = text.replace(/^<user-memory>\s*/i, "");
  const cut = visible ? withoutTag.lastIndexOf(visible) : -1;
  const injected = (cut >= 0 ? withoutTag.slice(0, cut) : withoutTag).trim();
  return { visible, injected: injected || null };
}
