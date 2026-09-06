import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconCopy } from "../icons";
import { bashCommandPreview } from "../lib/tool-render";
import { useT } from "../lib/locale-context";

export type BashCommandRowProps = {
  title: string;
  onInspect: () => void;
};

export function BashCommandRow({ title, onInspect }: BashCommandRowProps) {
  const t = useT();
  const { full, preview } = bashCommandPreview(title);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<DOMRect | null>(null);
  const closeTimer = useRef(0);
  const [copied, setCopied] = useState(false);

  function cancelClose() {
    window.clearTimeout(closeTimer.current);
  }

  function showCard() {
    cancelClose();
    setBox(wrapRef.current?.getBoundingClientRect() ?? null);
  }

  function hideCard() {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setBox(null), 140);
  }

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  function copy() {
    void navigator.clipboard.writeText(full).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  }

  const card = box
    ? createPortal(
        <div
          className="bash-cmd-card"
          role="dialog"
          aria-label={t("bash.fullCommand")}
          style={{
            top: Math.min(box.bottom + 6, window.innerHeight - 16),
            left: box.left,
            width: Math.max(box.width, 280),
            maxWidth: Math.min(520, window.innerWidth - box.left - 12),
          }}
          onMouseEnter={cancelClose}
          onMouseLeave={hideCard}
        >
          <div className="bash-cmd-card-head">
            <span>{t("bash.fullCommand")}</span>
            <button
              type="button"
              className="file-open"
              data-tip={copied ? t("toast.copied") : t("git.copyCommand")}
              aria-label={copied ? t("toast.copied") : t("git.copyCommand")}
              onClick={copy}
            >
              <IconCopy size={14} />
            </button>
          </div>
          <pre className="bash-cmd-full">{full}</pre>
        </div>,
        document.body,
      )
    : null;

  return (
    <div
      ref={wrapRef}
      className="bash-cmd"
      onMouseEnter={showCard}
      onMouseLeave={hideCard}
      onFocus={showCard}
      onBlur={hideCard}
    >
      <button type="button" className="bash-cmd-preview" onClick={onInspect} data-tip={t("bash.inspect")}>
        {preview}
      </button>
      {card}
    </div>
  );
}
