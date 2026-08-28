let pending: Promise<typeof import("mermaid")> | null = null;

export function loadMermaid(): Promise<typeof import("mermaid")> {
  if (!pending) pending = import("mermaid");
  return pending;
}
