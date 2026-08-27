import { IconBranch, IconFolder, IconFinder, IconTerminal } from "../icons";

export type ReviewHomeProps = {
  onOpen: (tab: "changes" | "files" | "preview" | "terminal") => void;
};

export function ReviewHome({ onOpen }: ReviewHomeProps) {
  const tiles = [
    { id: "changes" as const, label: "改动", Icon: IconBranch },
    { id: "files" as const, label: "文件", Icon: IconFolder },
    { id: "preview" as const, label: "预览", Icon: IconFinder },
    { id: "terminal" as const, label: "终端", Icon: IconTerminal },
  ];
  return (
    <div className="review-home">
      {tiles.map((t) => (
        <button key={t.id} type="button" className="review-tile" onClick={() => onOpen(t.id)}>
          <t.Icon size={22} />
          {t.label}
        </button>
      ))}
    </div>
  );
}
