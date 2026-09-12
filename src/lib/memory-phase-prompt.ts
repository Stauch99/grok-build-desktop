import type { DreamIo } from "./memory-dream";

export const TAGLINE_MAX_CHARS = 80;

const DAY_RE = /^# (\d{4}-\d{2}-\d{2})/m;

export const MAIN_OUTPUT_MARKERS = ["<<<DIARY>>>", "<<<USER>>>", "<<<SKILLS>>>", "<<<TAGLINE>>>"] as const;

export type SkillStub = {
  action: "create" | "patch" | "noop";
  id: string;
  title: string;
  target: string;
  evidence: string;
  summary: string;
};

export function parseSkillStubs(block: string): SkillStub[] {
  const chunks = block.split(/^\s*---\s*$/m);
  const out: SkillStub[] = [];
  for (const chunk of chunks) {
    const fields: Record<string, string> = {};
    for (const line of chunk.split(/\r?\n/)) {
      const m = line.match(/^(action|id|title|target|evidence|summary)\s*:\s*(.*)$/);
      if (!m) continue;
      fields[m[1]] = m[2].trim();
    }
    const action = fields.action;
    const id = fields.id?.trim() ?? "";
    if (!id || (action !== "create" && action !== "patch" && action !== "noop")) continue;
    out.push({
      action,
      id,
      title: fields.title ?? "",
      target: fields.target ?? "",
      evidence: fields.evidence ?? "",
      summary: fields.summary ?? "",
    });
  }
  return out;
}

function dayFromDaily(dailyMd: string): string {
  return DAY_RE.exec(dailyMd)?.[1] ?? "YYYY-MM-DD";
}

/**
 * One prompt per sweep. Produces the diary appendix, the USER.md rewrite,
 * and the one-line positioning tagline from the weighted daily corpus.
 */
export function mainPrompt(io: DreamIo, selected: readonly string[], skillNames: readonly string[] = []): string {
  const day = dayFromDaily(io.dailyMd);
  const catalog = skillNames.length ? skillNames.join(", ") : "(none)";
  return [
    "You are the workbench that was taught by this user. Write a capability review, not a session recap.",
    `Return exactly four sections, each introduced by its marker line (${MAIN_OUTPUT_MARKERS.join(", ")}).`,
    "No text before, between, or after the markers. No code fences.",
    "",
    "1) <<<DIARY>>> — one diary appendix headed",
    `   ## ${day} . Write 3–6 short paragraphs in the second person, as a collaborator`,
    "   who was corrected. Include at least one concrete teaching scene when the corpus",
    "   contains a teach_episode. Name the reusable rule. Do not inventory sessions.",
    "   Do not restate USER.md bullets. Do not pad with empty praise. If the selection",
    "   is empty, write one sentence that no new teaching landed.",
    "2) <<<USER>>> — a full replacement USER.md. Every newly added line must",
    "   include a Source: ref (agent · session). Stay within 8KiB. Keep existing",
    "   USER.md lines on conflict; do not resolve contradictions. Keep the '# '-heading",
    "   and '- ' bullet shape. Promote habits that will still be true next month, not one-off tasks.",
    "3) <<<SKILLS>>> — zero or more YAML stubs separated by --- with keys",
    "   action (create|patch|noop), id, title, target, evidence, summary.",
    "   Prefer noop with evidence that an existing skill still holds over inventing work.",
    `4) <<<TAGLINE>>> — one line (≤40 words) describing this workbench's memory for`,
    "   the user, in the user's language. No quotes, no period at the end.",
    "",
    "Existing skill catalog (names only):",
    catalog,
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

export type MainOutput = {
  diary: string | null;
  userMd: string | null;
  tagline: string | null;
  skills: SkillStub[];
};

/** Lenient section parse: any marker may be missing or empty → null. */
export function parseMainOutput(raw: string): MainOutput {
  const text = stripFence(raw);
  const markerRe = /<<<(DIARY|USER|SKILLS|TAGLINE)>>>/g;
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
  const skillsRaw = section("SKILLS");
  return {
    diary: section("DIARY"),
    userMd: section("USER"),
    tagline,
    skills: skillsRaw ? parseSkillStubs(skillsRaw) : [],
  };
}
