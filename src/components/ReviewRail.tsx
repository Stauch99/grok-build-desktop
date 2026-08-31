import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { IconGrokClose } from "../grok-icons";
import { IconBranch, IconChart, IconEye, IconFolder } from "../icons";
import {
  REVIEW_PEERS,
  REVIEW_SUBTABS,
  reviewPaneLabel,
  reviewPeerPane,
  reviewTabLabel,
  type ReviewPeerPane,
  type ReviewTab,
  type ReviewTabState,
} from "../lib/review-rail";
import { useLocale, useT } from "../lib/locale-context";

function peerIcon(id: ReviewPeerPane) {
  if (id === "git") return <IconBranch size={14} />;
  if (id === "preview") return <IconEye size={14} />;
  if (id === "explorer") return <IconFolder size={14} />;
  return <IconChart size={14} />;
}

export type ReviewRailProps = {
  activeTab: ReviewTab;
  tabs: ReviewTabState[];
  onTab: (tab: ReviewTab) => void;
  onClose: () => void;
  leaving?: boolean;
  width?: number;
  children: Partial<Record<ReviewTab, ReactNode>>;
};

export function ReviewRail({ activeTab, tabs, onTab, onClose, leaving = false, width, children }: ReviewRailProps) {
  const t = useT();
  const locale = useLocale();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastReview = useRef<ReviewTab>("progress");
  if (REVIEW_SUBTABS.has(activeTab)) lastReview.current = activeTab;
  const peer = reviewPeerPane(activeTab);
  const listTabs = tabs.filter((tab) => REVIEW_SUBTABS.has(tab.id));
  const gitTab = tabs.find((tab) => tab.id === "git");
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
  const selectTab = (tab: ReviewTab) => {
    if (tabs.some((item) => item.id === tab && item.available)) onTab(tab);
  };
  const selectPeer = (id: ReviewPeerPane) => {
    if (id === "review") selectTab(lastReview.current);
    else selectTab(id);
  };
  return (
    <aside
      className={`review-rail${leaving ? " rail-out" : ""}`}
      aria-label="Dashboard"
      role="region"
      style={width ? { width, flexBasis: width } : undefined}
    >
      <header className="review-head">
        <div className="review-panes" role="tablist" aria-label={t("rail.panes")}>
          {REVIEW_PEERS.map((pane) => {
            const label = reviewPaneLabel(locale, pane.id);
            return (
              <button
                key={pane.id}
                type="button"
                role="tab"
                id={`review-peer-${pane.id}`}
                aria-selected={peer === pane.id}
                aria-label={label}
                title={label}
                onClick={() => selectPeer(pane.id)}
              >
                <span className="review-pane-icon">{peerIcon(pane.id)}</span>
                <span className="review-pane-label">{label}</span>
                {pane.id === "git" && gitTab && gitTab.count > 0 ? <span className="tab-count">{gitTab.count}</span> : null}
              </button>
            );
          })}
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t("rail.close")} title={t("rail.close")}>
          <IconGrokClose size={16} />
        </button>
      </header>
      {peer === "review" ? (
        <div className="review-tabs" role="tablist" aria-label={t("rail.dashboardContent")}>
          {listTabs.map((tab, index) => (
            <button key={tab.id} ref={(node) => { tabRefs.current[index] = node; }} type="button" role="tab"
              id={`review-tab-${tab.id}`} aria-selected={activeTab === tab.id}
              aria-controls={`review-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1}
              disabled={!tab.available} onKeyDown={(event) => onTabKeyDown(event, index)} onClick={() => selectTab(tab.id)}>
              {reviewTabLabel(locale, tab.id)}{tab.count > 0 ? <span className="tab-count">{tab.count}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      <div className="review-body pane-in" key={activeTab} role="tabpanel" id={`review-panel-${activeTab}`} aria-labelledby={peer === "review" ? `review-tab-${activeTab}` : `review-peer-${peer}`}>
        {children[activeTab] ?? <p className="float-empty">{t("rail.empty", { label: reviewTabLabel(locale, activeTab) })}</p>}
      </div>
    </aside>
  );
}
