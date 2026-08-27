import { convertFileSrc } from "@tauri-apps/api/core";
import {
  attachmentIconLabel,
  attachmentMeta,
  attachmentVisualKind,
  type Attachment,
} from "../lib/attachments";

export type AttachStripProps = {
  items: Attachment[];
  onRemove: (path: string) => void;
};

export function AttachStrip({ items, onRemove }: AttachStripProps) {
  if (items.length === 0) return null;

  return (
    <div className="attach-strip" aria-label="附件">
      {items.map((item) => {
        const visual = attachmentVisualKind(item.name, item.kind);
        return (
          <div key={item.path} className="attach-card">
            <div className={`attach-icon is-${visual}`} aria-hidden>
              {visual === "image" ? (
                <img className="attach-thumb" src={convertFileSrc(item.path)} alt="" />
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
