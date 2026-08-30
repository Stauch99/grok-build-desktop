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
