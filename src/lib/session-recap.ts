export function recapIdentity(
  promptId?: string | null,
  text?: string | null,
): string {
  const id = promptId?.trim();
  if (id) return id;
  return (text ?? "").replace(/\s+/g, " ").trim();
}

export function shouldShowSessionRecap(opts: {
  text?: string | null;
  identity: string;
  dismissed?: string | null;
}): boolean {
  if (!opts.text?.trim()) return false;
  return opts.dismissed !== opts.identity;
}
