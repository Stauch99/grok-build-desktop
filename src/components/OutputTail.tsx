import { useState } from "react";
import { useT } from "../lib/locale-context";
import type { OutputCollapse } from "../lib/output-collapse";

export type OutputTailProps = {
  collapse: OutputCollapse;
  /** Extra class for the revealed tail <pre>, to match the host's pre skin. */
  className?: string;
};

/**
 * The "… N more lines" expander under a clamped tool output. Reveals the
 * remaining lines in a second pre so the head block stays rendered by the
 * parent (ToolResult, bash card) and only the tail toggles.
 */
export function OutputTail({ collapse, className }: OutputTailProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="output-tail">
      {open ? <pre className={className}>{collapse.rest}</pre> : null}
      <button
        type="button"
        className="output-tail-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? t("thread.fewerLines") : t("thread.moreLines", { n: collapse.hidden })}
      </button>
    </div>
  );
}
