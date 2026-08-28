import { basename } from "../lib/text";
import type { PreviewTab } from "../lib/preview";

export type PreviewTabsProps = {
  tabs: PreviewTab[];
  active: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
};

export function PreviewTabs({ tabs, active, onSelect, onClose }: PreviewTabsProps) {
  if (tabs.length === 0) return null;
  return (
    <div className="preview-tabs" role="tablist" aria-label="预览标签">
      {tabs.map((tab) => (
        <div key={tab.path} className="preview-tab" data-active={tab.path === active ? "true" : undefined}>
          <button
            type="button"
            role="tab"
            aria-selected={tab.path === active}
            title={tab.path}
            onClick={() => onSelect(tab.path)}
          >
            {basename(tab.path)}
          </button>
          <button
            type="button"
            className="preview-tab-close"
            aria-label={`关闭 ${basename(tab.path)}`}
            title="关闭标签"
            onClick={() => onClose(tab.path)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
