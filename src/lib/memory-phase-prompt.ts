import type { DreamIo, DreamPhase } from "./memory-dream";

function dayFromDaily(dailyMd: string): string {
  const m = dailyMd.match(/^# (\d{4}-\d{2}-\d{2})/m);
  return m?.[1] ?? "YYYY-MM-DD";
}

export function phasePrompt(phase: DreamPhase, io: DreamIo): string {
  const day = dayFromDaily(io.dailyMd);
  if (phase === "light") {
    return [
      `Rewrite daily/${day}.md.`,
      "Return only the replacement daily markdown body.",
      "Do not edit other files.",
      "",
      "Current daily file:",
      io.dailyMd.trim() || `# ${day}\n`,
    ].join("\n");
  }
  if (phase === "rem") {
    return [
      `Append one diary entry headed ## ${day}.`,
      "Return only that appendix (one ## YYYY-MM-DD section).",
      "Do not edit USER.md. USER.md edits are forbidden.",
      "",
      "Today's daily file:",
      io.dailyMd.trim() || `# ${day}\n`,
      "",
      "Existing DREAMS.md:",
      io.dreamsMd.trim() || "(empty)",
    ].join("\n");
  }
  return [
    "Return a full replacement USER.md.",
    "Every newly promoted line must include a Source: ref (agent · session).",
    "Stay within 8KiB. Keep prior entries unless they are wrong.",
    "",
    "Current USER.md:",
    io.userMd.trim() || "# You\n",
    "",
    "Today's daily file:",
    io.dailyMd.trim() || `# ${day}\n`,
    "",
    "Recent DREAMS.md:",
    io.dreamsMd.trim() || "(empty)",
  ].join("\n");
}
