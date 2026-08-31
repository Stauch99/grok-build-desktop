import type { ReactNode } from "react";
import { IconFileTxt, IconFinder, IconFolder } from "../icons";

export type FileListRowProps = {
  name: string;
  crumb?: string;
  path: string;
  kind?: "file" | "dir";
  onOpen: () => void;
  onReveal: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
};

/** One-line name, optional parent crumb, Finder on the right. */
export function FileListRow({
  name,
  crumb,
  path,
  kind = "file",
  onOpen,
  onReveal,
  leading,
  trailing,
}: FileListRowProps) {
  return (
    <div className="file-entry">
      {leading}
      <button type="button" className="file-entry-main" title={path} onClick={onOpen}>
        {leading ? null : (
          <span className="file-entry-icon" aria-hidden>
            {kind === "dir" ? <IconFolder size={14} /> : <IconFileTxt size={14} />}
          </span>
        )}
        <span className="file-entry-text">
          <span className="file-entry-name">{name}</span>
          {crumb ? <span className="file-crumb">{crumb}</span> : null}
        </span>
      </button>
      {trailing}
      <button
        type="button"
        className="file-open file-finder"
        title="在访达中打开"
        aria-label="在访达中打开"
        onClick={onReveal}
      >
        <IconFinder size={14} />
      </button>
    </div>
  );
}
