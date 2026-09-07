import type { ReactNode } from "react";
import { IconFileTxt, IconFinder, IconFolder, IconPaperclip } from "../icons";
import { useT } from "../lib/locale-context";

export type FileListRowProps = {
  name: string;
  crumb?: string;
  path: string;
  kind?: "file" | "dir";
  onOpen: () => void;
  onReveal: () => void;
  onAttach?: () => void;
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
  onAttach,
  leading,
  trailing,
}: FileListRowProps) {
  const t = useT();
  return (
    <div className="file-entry">
      {leading}
      <button type="button" className="file-entry-main" data-tip={path} onClick={onOpen}>
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
      {onAttach ? (
        <button
          type="button"
          className="file-open file-attach"
          data-tip={t("session.attach")}
          aria-label={t("session.attach")}
          onClick={onAttach}
        >
          <IconPaperclip size={14} />
        </button>
      ) : null}
      <button
        type="button"
        className="file-open file-finder"
        data-tip={t("finder.open")}
        aria-label={t("finder.open")}
        onClick={onReveal}
      >
        <IconFinder size={14} />
      </button>
    </div>
  );
}
