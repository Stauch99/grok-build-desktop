export const OUTPUT_COLLAPSE_AT = 12;
export const OUTPUT_COLLAPSE_HEAD = 6;

export type OutputCollapse = {
  /** First lines, always rendered. */
  head: string;
  /** Remaining lines, rendered behind the "… N more lines" expander. */
  rest: string;
  /** Line count hidden while collapsed (rest's line count). */
  hidden: number;
};

/**
 * Long tool output collapses to `head` lines + an expander row. Running tool
 * calls (live) and short output pass through untouched so streaming text never
 * collapses mid-append.
 */
export function collapseToolOutput(
  text: string | undefined,
  live: boolean,
  collapseAt = OUTPUT_COLLAPSE_AT,
  head = OUTPUT_COLLAPSE_HEAD,
): OutputCollapse | null {
  if (live || !text) return null;
  const lines = text.split("\n");
  if (lines.length <= collapseAt) return null;
  return {
    head: lines.slice(0, head).join("\n"),
    rest: lines.slice(head).join("\n"),
    hidden: lines.length - head,
  };
}
