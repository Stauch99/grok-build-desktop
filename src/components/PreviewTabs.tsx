import { basename } from "../lib/text";
import type { PreviewTab } from "../lib/preview";
import { useT } from "../lib/locale-context";

export type PreviewTabsProps = {
  tabs: PreviewTab[];
  active: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
};

export function PreviewTabs({ tabs, active, onSelect, onClose }: PreviewTabsProps) {
  const t = useT();
  if (tabs.length === 0) return null;
  return (
    <div className="preview-tabs" role="tablist" aria-label={t("preview.tabs")}>
      {tabs.map((tab) => (
        <div key={tab.path} className="preview-tab" data-active={tab.path === active ? "true" : undefined}>
          <button
            type="button"
            role="tab"
            aria-selected={tab.path === active}
            onClick={() => onSelect(tab.path)}
          >
            {basename(tab.path)}
          </button>
          <button
            type="button"
            className="preview-tab-close"
            aria-label={t("preview.closeTab", { name: basename(tab.path) })}
            onClick={() => onClose(tab.path)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
