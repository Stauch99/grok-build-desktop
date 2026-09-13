import { highlightQuery } from "../lib/search-highlight";

/** Renders `text` with a <mark> around each case-insensitive hit of `query`. */
export function HighlightText({ text, query }: { text: string; query: string }) {
  const parts = highlightQuery(text, query);
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="hit-mark">
            {p.text}
          </mark>
        ) : (
          p.text
        ),
      )}
    </>
  );
}
