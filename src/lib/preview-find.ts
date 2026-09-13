export type FindMatch = { start: number; end: number };

export type PreviewFind = {
  query: string;
  matches: FindMatch[];
  index: number;
};

export type PreviewFindState = PreviewFind;

export function previewFind(text: string, query: string): PreviewFind {
  const needle = query.trim().toLowerCase();
  if (!needle) return { query, matches: [], index: -1 };
  const matches: FindMatch[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  while (from < text.length) {
    const at = lower.indexOf(needle, from);
    if (at < 0) break;
    matches.push({ start: at, end: at + needle.length });
    from = at + needle.length;
  }
  return { query, matches, index: matches.length ? 0 : -1 };
}

export function findNext(state: PreviewFind): PreviewFind {
  if (state.matches.length === 0) return state;
  return { ...state, index: (state.index + 1) % state.matches.length };
}

export function findPrev(state: PreviewFind): PreviewFind {
  if (state.matches.length === 0) return state;
  return { ...state, index: (state.index - 1 + state.matches.length) % state.matches.length };
}
