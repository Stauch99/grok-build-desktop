import { convertFileSrc } from "@tauri-apps/api/core";
import { assetRoots, safeFileSrc } from "../lib/asset-src";
import {
  attachmentIconLabel,
  attachmentMeta,
  attachmentVisualKind,
  type Attachment,
} from "../lib/attachments";

export type AttachStripProps = {
  items: Attachment[];
  onRemove: (path: string) => void;
  cwd?: string;
  grokHome?: string;
};

export function AttachStrip({ items, onRemove, cwd = "", grokHome = "" }: AttachStripProps) {
  if (items.length === 0) return null;
  const roots = assetRoots(cwd, grokHome);

  return (
    <div className="attach-strip" aria-label="附件">
      {items.map((item) => {
        const visual = attachmentVisualKind(item.name, item.kind);
        const thumb = visual === "image" ? safeFileSrc(item.path, roots, convertFileSrc) : null;
        return (
          <div key={item.path} className="attach-card">
            <div className={`attach-icon is-${visual}`} aria-hidden>
              {thumb ? (
                <img className="attach-thumb" src={thumb} alt="" />
              ) : (
                attachmentIconLabel(item.name, item.kind)
              )}
            </div>
            <div className="attach-body">
              <div className="attach-name" title={item.path}>
                {item.name}
              </div>
              <div className="attach-meta">{attachmentMeta(item)}</div>
            </div>
            <button
              type="button"
              className="attach-remove"
              aria-label={`移除 ${item.name}`}
              onClick={() => onRemove(item.path)}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
