import type { DreamIo } from "./memory-dream";

export const TAGLINE_MAX_CHARS = 80;

const DAY_RE = /^# (\d{4}-\d{2}-\d{2})/m;

export const MAIN_OUTPUT_MARKERS = ["<<<DIARY>>>", "<<<USER>>>", "<<<TAGLINE>>>"] as const;

function dayFromDaily(dailyMd: string): string {
  return DAY_RE.exec(dailyMd)?.[1] ?? "YYYY-MM-DD";
}

/**
 * One prompt per sweep. Produces the diary appendix, the USER.md rewrite,
 * and the one-line positioning tagline from the weighted daily corpus.
 */
export function mainPrompt(io: DreamIo, selected: readonly string[]): string {
  const day = dayFromDaily(io.dailyMd);
  return [
    "You are maintaining long-term memory for a coding workbench.",
    `Return exactly three sections, each introduced by its marker line (${MAIN_OUTPUT_MARKERS.join(", ")}).`,
    "No text before, between, or after the markers. No code fences.",
    "",
    "1) <<<DIARY>>> — one diary appendix: a single section headed",
    `   ## ${day} , followed by 2-4 sentences written as the workbench`,
    "   itself, reflecting on what the user seems to prefer or struggle with today.",
    "2) <<<USER>>> — a full replacement USER.md. Every newly added line must",
    "   include a Source: ref (agent · session). Stay within 8KiB. Keep existing",
    "   USER.md lines on conflict; do not resolve contradictions. Keep the '# '-heading",
    "   and '- ' bullet shape.",
    `3) <<<TAGLINE>>> — one line (≤40 words) describing this workbench's memory for`,
    "   the user, in the user's language. No quotes, no period at the end.",
    "",
    "Selected corpus for today (highest-weight lines; format: - [agent | session | cwd | kind] text):",
    selected.length ? selected.join("\n") : "(nothing new)",
    "",
    "Current USER.md:",
    io.userMd.trim() || "# You\n",
    "",
    "Existing DREAMS.md (diary tail, for continuity):",
    io.dreamsMd.trim() || "(empty)",
  ].join("\n");
}

function stripFence(text: string): string {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  const m = trimmed.match(/^```(?:\w+)?\r?\n([\s\S]*?)\r?\n```[ \t]*$/);
  return m ? m[1] : trimmed;
}

export type MainOutput = { diary: string | null; userMd: string | null; tagline: string | null };

/** Lenient section parse: any marker may be missing or empty → null. */
export function parseMainOutput(raw: string): MainOutput {
  const text = stripFence(raw);
  const markerRe = /<<<(DIARY|USER|TAGLINE)>>>/g;
  const buckets = new Map<string, string[]>();
  let current: string | null = null;
  let lastIndex = 0;
  for (const m of text.matchAll(markerRe)) {
    if (current) {
      buckets.get(current)!.push(text.slice(lastIndex, m.index));
    }
    current = m[1];
    if (!buckets.has(current)) buckets.set(current, []);
    lastIndex = m.index! + m[0].length;
  }
  if (current) buckets.get(current)!.push(text.slice(lastIndex));

  const section = (name: string): string | null => {
    const parts = buckets.get(name);
    const value = (parts ?? []).join("\n").trim();
    return value || null;
  };

  let tagline = section("TAGLINE");
  if (tagline) {
    tagline = tagline.split(/\r?\n/)[0]!.trim().slice(0, TAGLINE_MAX_CHARS) || null;
  }
  return {
    diary: section("DIARY"),
    userMd: section("USER"),
    tagline,
  };
}
