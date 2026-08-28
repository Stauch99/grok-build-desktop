import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { IconGrokClose } from "../grok-icons";
import { REVIEW_SUBTABS, type ReviewTab, type ReviewTabState } from "../lib/review-rail";

export type ReviewRailProps = {
  activeTab: ReviewTab;
  tabs: ReviewTabState[];
  width: number;
  onTab: (tab: ReviewTab) => void;
  onClose: () => void;
  children: Partial<Record<ReviewTab, ReactNode>>;
};

export function ReviewRail({ activeTab, tabs, width, onTab, onClose, children }: ReviewRailProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastReview = useRef<ReviewTab>("changes");
  if (REVIEW_SUBTABS.has(activeTab)) lastReview.current = activeTab;
  const reviewPane = activeTab !== "preview";
  const listTabs = tabs.filter((tab) => REVIEW_SUBTABS.has(tab.id));
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const enabled = listTabs.map((tab, i) => tab.available ? i : -1).filter((i) => i >= 0);
    const at = enabled.indexOf(index);
    const next = event.key === "Home" ? enabled[0]
      : event.key === "End" ? enabled[enabled.length - 1]
      : enabled[(at + (event.key === "ArrowRight" ? 1 : -1) + enabled.length) % enabled.length];
    const tab = listTabs[next];
    if (tab) { onTab(tab.id); tabRefs.current[next]?.focus(); }
  }
  const active = tabs.find((tab) => tab.id === activeTab);
  const selectTab = (tab: ReviewTab) => {
    if (tabs.some((item) => item.id === tab && item.available)) onTab(tab);
  };
  return (
    <aside className="review-rail" style={{ width, flexBasis: width }} aria-label="审阅" role="region">
      <header className="review-head">
        <div className="review-panes" role="tablist" aria-label="右侧栏">
          <button type="button" role="tab" aria-selected={reviewPane} onClick={() => selectTab(lastReview.current)}>
            审阅
          </button>
          <button type="button" role="tab" aria-selected={!reviewPane} onClick={() => selectTab("preview")}>
            预览
          </button>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭审阅" title="关闭审阅">
          <IconGrokClose size={16} />
        </button>
      </header>
      {reviewPane ? (
        <div className="review-tabs" role="tablist" aria-label="审阅内容">
          {listTabs.map((tab, index) => (
            <button key={tab.id} ref={(node) => { tabRefs.current[index] = node; }} type="button" role="tab"
              id={`review-tab-${tab.id}`} aria-selected={activeTab === tab.id}
              aria-controls={`review-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1}
              disabled={!tab.available} onKeyDown={(event) => onTabKeyDown(event, index)} onClick={() => selectTab(tab.id)}>
              {tab.label}{tab.count > 0 ? <span className="tab-count">{tab.count}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      <div className="review-body" role="tabpanel" id={`review-panel-${activeTab}`} aria-labelledby={`review-tab-${activeTab}`}>
        {children[activeTab] ?? <p className="float-empty">{active?.label ?? "此项"}暂无内容。</p>}
      </div>
    </aside>
  );
}
