/**
 * Rough prompt cost for the composer chip: ~4 chars per token, plus a flat
 * read cost per attachment (the agent has to open the file).
 */

export const TOKEN_CHARS_PER = 4;
export const TOKEN_PER_ATTACHMENT = 500;
export const TOKEN_CHIP_MIN_CHARS = 1500;

/** Estimated tokens for `chars` of prompt text plus `attachments` files. */
export function estimateTokens(chars: number, attachments = 0): number {
  const text = Math.ceil(Math.max(0, chars) / TOKEN_CHARS_PER);
  return text + Math.max(0, attachments) * TOKEN_PER_ATTACHMENT;
}

/** The chip only earns its pixels once the prompt is genuinely long. */
export function showTokenChip(chars: number): boolean {
  return chars > TOKEN_CHIP_MIN_CHARS;
}
