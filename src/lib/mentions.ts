export type MentionGroup = "special" | "dir" | "change" | "file";

export type MentionHit = {
  id: string;
  label: string;
  insert: string;
  group: MentionGroup;
};

const CHANGES_ALIASES = ["本次改动", "changes", "git"];

function matches(query: string, label: string): boolean {
  if (!query) return true;
  return label.toLowerCase().includes(query);
}

/**
 * Ranked @-mention list. `query` is the text after the last `@`, without the
 * sigil. Selecting "本次改动" expands to one `@path` per working-tree file so
 * the agent sees real paths, not a private token.
 */
export function filterMentions(input: {
  query: string;
  files?: string[];
  dirs?: string[];
  changes?: string[];
}): MentionHit[] {
  const q = input.query.replace(/^@/, "").toLowerCase().trim();
  const hits: MentionHit[] = [];

  const changes = (input.changes ?? []).filter(Boolean);
  if (changes.length > 0 && CHANGES_ALIASES.some((a) => matches(q, a))) {
    hits.push({
      id: "special:changes",
      label: `本次改动（${changes.length}）`,
      insert: changes.map((p) => `@${p}`).join(" "),
      group: "special",
    });
  }

  const seen = new Set<string>();
  for (const dir of input.dirs ?? []) {
    if (!dir || seen.has(dir) || !matches(q, dir.toLowerCase())) continue;
    seen.add(dir);
    hits.push({
      id: `dir:${dir}`,
      label: dir.endsWith("/") ? dir : `${dir}/`,
      insert: `@${dir.replace(/\/?$/, "/")}`,
      group: "dir",
    });
    if (hits.length >= 12) return hits;
  }

  for (const path of changes) {
    if (seen.has(path) || !matches(q, path.toLowerCase())) continue;
    seen.add(path);
    hits.push({
      id: `change:${path}`,
      label: path,
      insert: `@${path}`,
      group: "change",
    });
    if (hits.length >= 12) return hits;
  }

  for (const path of input.files ?? []) {
    if (!path || seen.has(path) || !matches(q, path.toLowerCase())) continue;
    seen.add(path);
    hits.push({
      id: `file:${path}`,
      label: path,
      insert: `@${path}`,
      group: "file",
    });
    if (hits.length >= 12) return hits;
  }

  return hits;
}

/** True when the prompt should offer @-mentions (slash input wins). */
export function mentionMenuVisible(query: string): boolean {
  if (query.startsWith("/")) return false;
  const at = query.lastIndexOf("@");
  return at >= 0 && !query.slice(at + 1).includes("\n");
}

export function mentionRequestIsCurrent(input: { requestGeneration: number; currentGeneration: number; requestQuery: string; currentQuery: string; visible: boolean; requestOwner: string; currentOwner: string }): boolean {
  return input.visible && input.requestGeneration === input.currentGeneration && input.requestQuery === input.currentQuery && input.requestOwner === input.currentOwner;
}

type MentionRequestToken = {
  generation: number;
  query: string;
  owner: string;
};

export function createMentionLifecycle(initialOwner: string) {
  let owner = initialOwner;
  let generation = 0;
  let query = "";
  let visible = false;

  return {
    begin(nextQuery: string): MentionRequestToken {
      generation += 1;
      query = nextQuery;
      visible = true;
      return { generation, query, owner };
    },
    changeOwner(nextOwner: string) {
      if (nextOwner === owner) return;
      owner = nextOwner;
      generation += 1;
      query = "";
      visible = false;
    },
    isCurrent(request: MentionRequestToken): boolean {
      return mentionRequestIsCurrent({
        requestGeneration: request.generation,
        currentGeneration: generation,
        requestQuery: request.query,
        currentQuery: query,
        visible,
        requestOwner: request.owner,
        currentOwner: owner,
      });
    },
    snapshot() {
      return { owner, generation, query, visible };
    },
  };
}
