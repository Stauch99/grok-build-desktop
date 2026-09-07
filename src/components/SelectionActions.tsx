import { useEffect, useState } from "react";
import { composeRewriteDraft, formatQuote, toolbarPlacement, TOOLBAR_H, TOOLBAR_W } from "../lib/selection-actions";
import { useT } from "../lib/locale-context";
import type { TextSelectionState } from "../hooks/useTextSelection";

interface SelectionActionsProps {
  state: TextSelectionState | null;
  viewport: { width: number; height: number };
  locale: "zh" | "en";
  onRewrite: (draft: string) => void;
  onQuote: (quote: string) => void;
}

export function SelectionActions({ state, viewport, locale, onRewrite, onQuote }: SelectionActionsProps) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 900);
    return () => clearTimeout(id);
  }, [copied]);

  if (!state) return null;
  const p = toolbarPlacement(state.rect, viewport, { width: TOOLBAR_W, height: TOOLBAR_H });

  async function copy() {
    try {
      await navigator.clipboard.writeText(state!.text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className="sel-toolbar"
      role="toolbar"
      onMouseDown={(e) => e.preventDefault()}
      style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
    >
      <button type="button" onClick={() => onRewrite(composeRewriteDraft(formatQuote(state!.text), locale))}>
        {t("selection.rewrite")}
      </button>
      <button type="button" onClick={() => onQuote(formatQuote(state!.text))}>
        {t("selection.quote")}
      </button>
      <button type="button" onClick={() => void copy()}>
        {copied ? t("selection.copied") : t("selection.copy")}
      </button>
    </div>
  );
}
