import type { ChatItem } from "./chat";

export const SUMMARY_TURN_THRESHOLD = 10;

function clip(text: string, n: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) : t;
}

export function dialogueTurns(items: ChatItem[]): ChatItem[] {
  return items.filter((item) => item.kind === "user" || item.kind === "assistant");
}

export function shouldShowSummary(items: ChatItem[]): boolean {
  return dialogueTurns(items).length > SUMMARY_TURN_THRESHOLD;
}

/** First user text (120) + last assistant (120). No model call. */
export function summarizeThread(items: ChatItem[]): string {
  const firstUser = items.find((item) => item.kind === "user");
  let lastAssistant: Extract<ChatItem, { kind: "assistant" }> | undefined;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind === "assistant") {
      lastAssistant = item;
      break;
    }
  }
  const parts: string[] = [];
  if (firstUser?.kind === "user" && firstUser.text) parts.push(clip(firstUser.text, 120));
  if (lastAssistant?.text) parts.push(clip(lastAssistant.text, 120));
  return parts.join("\n");
}

export function firstUserPreview(items: ChatItem[], n = 40): string {
  const first = items.find((item) => item.kind === "user");
  return first?.kind === "user" ? clip(first.text, n) : "";
}
