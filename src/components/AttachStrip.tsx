import { convertFileSrc } from "@tauri-apps/api/core";
import { assetRoots, safeFileSrc } from "../lib/asset-src";
import {
  attachmentChipLayout,
  attachmentMeta,
  attachmentVisualKind,
  type Attachment,
  type AttachmentVisualKind,
} from "../lib/attachments";
import {
  IconCode,
  IconFileDoc,
  IconFilePdf,
  IconFilePpt,
  IconFileTxt,
  IconFileXls,
  IconFileZip,
  IconFolder,
  IconMarkdown,
  IconPhoto,
} from "../icons";
import { useT } from "../lib/locale-context";

export type AttachStripProps = {
  items: Attachment[];
  onRemove: (path: string) => void;
  cwd?: string;
  grokHome?: string;
};

function AttachKindIcon({ visual }: { visual: AttachmentVisualKind }) {
  switch (visual) {
    case "pdf":
      return <IconFilePdf />;
    case "word":
      return <IconFileDoc />;
    case "excel":
      return <IconFileXls />;
    case "ppt":
      return <IconFilePpt />;
    case "zip":
      return <IconFileZip />;
    case "md":
      return <IconMarkdown size={22} />;
    case "code":
      return <IconCode size={22} />;
    case "folder":
      return <IconFolder size={22} />;
    case "image":
      return <IconPhoto />;
    default:
      return <IconFileTxt size={22} />;
  }
}

export function AttachStrip({ items, onRemove, cwd = "", grokHome = "" }: AttachStripProps) {
  const t = useT();
  if (items.length === 0) return null;
  const roots = assetRoots(cwd, grokHome);

  return (
    <div className="attach-strip" aria-label={t("attach.strip")}>
      {items.map((item) => {
        const visual = attachmentVisualKind(item.name, item.kind);
        const layout = attachmentChipLayout(visual);
        const thumb = visual === "image" ? safeFileSrc(item.path, roots, convertFileSrc) : null;
        const thumbCard = layout === "thumb";
        return (
          <div key={item.path} className={`attach-card ${thumbCard ? "is-thumb" : "is-file"}`}>
            {thumbCard ? (
              thumb ? (
                <img className="attach-thumb" src={thumb} alt="" />
              ) : (
                <div className={`attach-icon is-${visual}`} aria-hidden>
                  <AttachKindIcon visual={visual} />
                </div>
              )
            ) : (
              <>
                <div className={`attach-icon is-${visual}`} aria-hidden>
                  <AttachKindIcon visual={visual} />
                </div>
                <div className="attach-body">
                  <div className="attach-name">
                    {item.name}
                  </div>
                  <div className="attach-meta">{attachmentMeta(item)}</div>
                </div>
              </>
            )}
            <button
              type="button"
              className="attach-remove"
              aria-label={t("attach.remove", { name: item.name })}
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
