export function foundingPrompt(opts: {
  episodes: string;
  userMd: string;
  skillNames: readonly string[];
  memoryClip: string;
  day: string;
}): string {
  return [
    "You are writing the founding dream for this workbench: a capability review of historical teaching, not a session inventory.",
    "Return exactly four sections: <<<DIARY>>> <<<USER>>> <<<SKILLS>>> <<<TAGLINE>>>",
    "No text before, between, or after the markers. No code fences.",
    "",
    `1) <<<DIARY>>> — one chapter headed ## 大梦 · ${opts.day}`,
    "   Up to ~800 words. Second person. Concrete teaching scenes. Named reusable capabilities.",
    "   Health-check what already works. Remember the whole person when episodes support it. Do not invent.",
    "2) <<<USER>>> — full USER.md, ≤8KiB, heading + bullets, Source: on every new line.",
    "3) <<<SKILLS>>> — YAML stubs (action/id/title/target/evidence/summary) separated by ---.",
    "4) <<<TAGLINE>>> — one line, user language, no quotes, no period.",
    "",
    "Skill catalog (names only):",
    opts.skillNames.length ? opts.skillNames.join(", ") : "(none)",
    "",
    "Current USER.md:",
    opts.userMd.trim() || "# You\n",
    "",
    "Global memory clip:",
    opts.memoryClip.trim() || "(empty)",
    "",
    "Teaching episodes:",
    opts.episodes.trim() || "(none)",
  ].join("\n");
}

export function domainPrompt(opts: { domain: string; episodes: string; skillNames: readonly string[] }): string {
  return [
    `Write a domain dream for ${opts.domain}. Same four markers as the founding dream.`,
    "Focus on teaching scenes in this domain only.",
    "",
    "Skill catalog:",
    opts.skillNames.length ? opts.skillNames.join(", ") : "(none)",
    "",
    "Episodes:",
    opts.episodes.trim() || "(none)",
  ].join("\n");
}

export function mergePrompt(opts: {
  domainNotes: string;
  userMd: string;
  skillNames: readonly string[];
  memoryClip: string;
  day: string;
}): string {
  return foundingPrompt({
    episodes: opts.domainNotes,
    userMd: opts.userMd,
    skillNames: opts.skillNames,
    memoryClip: opts.memoryClip,
    day: opts.day,
  });
}
