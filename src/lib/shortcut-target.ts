export type ShortcutTarget = { tagName?: string; isContentEditable?: boolean; parentElement?: ShortcutTarget | null };
const EDITABLE_TAGS = new Set(["input", "textarea", "select", "button"]);
export function isEditableShortcutTarget(target: ShortcutTarget | null): boolean {
  for (let node = target; node; node = node.parentElement ?? null) {
    if (node.isContentEditable || EDITABLE_TAGS.has((node.tagName ?? "").toLowerCase())) return true;
  }
  return false;
}
