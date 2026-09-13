import { tr } from "./i18n-bridge";

export type RewindKind = "files" | "conversation";

/** UI「回到这里」reverts file checkpoints. CLI `/rewind` rolls the conversation. */
export function rewindHint(kind: RewindKind): string {
  if (kind === "files") {
    return tr("rewind.hintFiles");
  }
  return tr("rewind.hintConv");
}

export function rewindConfirmLabel(kind: RewindKind): string {
  return kind === "files" ? tr("rewind.confirm") : tr("rewind.confirmConv");
}
