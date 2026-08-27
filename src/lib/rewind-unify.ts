export type RewindKind = "files" | "conversation";

/** UI「回到这里」reverts file checkpoints. CLI `/rewind` rolls the conversation. */
export function rewindHint(kind: RewindKind): string {
  if (kind === "files") {
    return "只还原这一轮改过的文件，对话记录还在。会话级撤销请用 /rewind。";
  }
  return "回到上一轮对话，之后的消息会丢掉。文件还原请用「回到这里」。";
}

export function rewindConfirmLabel(kind: RewindKind): string {
  return kind === "files" ? "还原这些文件" : "回退对话";
}
