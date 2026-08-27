import {
  Fragment,
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { openPath } from "../api";
import {
  assistantCopyReady,
  groupWorkRuns,
  workRunLabel,
  workRunMeta,
  type ChatItem,
  type ChatState,
} from "../lib/chat";
import {
  formatClock,
  thoughtDuration,
  turnSeparatorLabel,
  usageTone,
} from "../lib/time";
import { diffStatLabel } from "../lib/tool-render";
import { resolveOpenTarget } from "../lib/text";
import { IconCheck, IconChevron, IconClose, IconCopy } from "../icons";
import { DotMatrix } from "./DotMatrix";
import { Markdown } from "./Markdown";
import { ToolResult } from "./ToolResult";
import { TrajectoryView } from "./TrajectoryView";
import { trajectoryRows } from "../lib/trajectory";
import { UserTurn } from "./UserTurn";

/**
 * Clicking a local file opens the preview pane; ⌘/Ctrl-click reveals it in the
 * OS instead. Web links always go to the browser. Callers that cannot preview
 * (the split pane) pass no `onPreview` and get the old open-in-OS behaviour.
 */
export function handleMdClick(
  e: ReactMouseEvent,
  cwd: string,
  onPreview?: (path: string) => void,
) {
  const el = e.target;
  if (!(el instanceof Element)) return;
  const a = el.closest("a");
  if (!(a instanceof HTMLAnchorElement)) return;
  const target = resolveOpenTarget(a.getAttribute("href") || "", cwd);
  if (!target) return;
  e.preventDefault();
  const isWeb = /^https?:\/\//i.test(target);
  if (!isWeb && onPreview && !e.metaKey && !e.ctrlKey) {
    onPreview(target);
    return;
  }
  void openPath(target);
}

export function UsageMark({
  usage,
  pct,
  compactPercent = 85,
}: {
  usage?: { used?: number; size?: number };
  pct: number | null;
  compactPercent?: number;
}) {
  const tone = usageTone(pct, compactPercent);
  const used = usage?.used ?? 0;
  const size = usage?.size;
  const title =
    pct != null && size
      ? `上下文 ${pct}%（${used}/${size}）`
      : "打开会话后显示窗口占用";
  return (
    <span className={`usage-chip usage-chip-${tone}`} title={title}>
      <span className="usage-bar" aria-hidden>
        <span className="usage-bar-fill" style={{ width: `${pct ?? 0}%` }} />
      </span>
      {pct != null ? `${pct}%` : "—"}
    </span>
  );
}

export function WaitPill({
  status,
  elapsed,
  note,
  onStop,
}: {
  status: string;
  elapsed: string;
  /** Stall warning. Empty while output keeps arriving. */
  note?: string;
  onStop: () => void;
}) {
  return (
    <div className={`wait-pill${note ? " stalled" : ""}`}>
      <span className="wait-status" aria-hidden>
        <DotMatrix />
      </span>
      <span className="wait-label">{status}</span>
      {note ? (
        <span className="wait-note" role="status">
          {note}
        </span>
      ) : null}
      <span className="wait-time">{elapsed}</span>
      <button type="button" className="wait-stop" onClick={onStop}>
        停止
      </button>
    </div>
  );
}

const FOLD_STATUS_META = new Set([
  "pending",
  "in_progress",
  "completed",
  "failed",
  "cancelled",
]);

export function Fold({
  label,
  meta,
  metaKind,
  children,
}: {
  label: string;
  meta?: string;
  metaKind?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const metaClass =
    meta || metaKind
      ? [
          "fold-meta",
          ...(metaKind ? [metaKind] : []),
          ...(meta && FOLD_STATUS_META.has(meta) ? [meta] : []),
        ].join(" ")
      : undefined;
  return (
    <div className={`fold ${open ? "open" : ""}`}>
      <button type="button" className="fold-head" onClick={() => setOpen((v) => !v)}>
        <span className="fold-chev"><IconChevron size={12} /></span>
        <span className="fold-label">{label}</span>
        {meta ? <span className={metaClass}>{meta}</span> : null}
      </button>
      {open && children ? <div className="fold-body">{children}</div> : null}
    </div>
  );
}

export function ChatRow({
  item,
  dark,
  paneId = "main",
  cwd = "",
  sessionModel,
  showCopy = true,
  onResendUser,
  rewindFor,
  onForkTurn,
  onInspectTool,
  onPreviewPath,
  highlightQuery,
}: {
  item: ChatItem;
  dark: boolean;
  paneId?: string;
  cwd?: string;
  sessionModel?: string | null;
  /** False while the agent is still writing this turn. */
  showCopy?: boolean;
  onResendUser?: (text: string) => void;
  rewindFor?: (itemId: string) => (() => void) | undefined;
  onForkTurn?: (itemId: string) => void;
  onInspectTool?: (item: Extract<ChatItem, { kind: "tool" }>) => void;
  onPreviewPath?: (path: string) => void;
  highlightQuery?: string;
}) {
  const openPathAbs = (p: string) => {
    const target = p.startsWith("/") ? p : cwd ? `${cwd.replace(/\/$/, "")}/${p}` : p;
    void openPath(target);
  };
  if (item.kind === "user") {
    const clock = item.at != null ? formatClock(item.at) : undefined;
    return (
      <div
        id={`turn-${paneId}-${item.id}`}
        className={`turn-user${highlightQuery && item.text.toLowerCase().includes(highlightQuery.toLowerCase()) ? " search-hit" : ""}`}
      >
        <UserTurn
          text={item.text}
          cwd={cwd}
          model={item.model}
          clock={clock || undefined}
          sessionModel={sessionModel}
          onClick={(e) => handleMdClick(e, cwd, onPreviewPath)}
          onCopy={() => void navigator.clipboard.writeText(item.text)}
          onResend={() => onResendUser?.(item.text)}
          onEditResend={onResendUser}
          onRewind={rewindFor?.(item.id)}
          onFork={onForkTurn ? () => onForkTurn(item.id) : undefined}
        />
      </div>
    );
  }
  if (item.kind === "assistant") {
    return (
      <article
        id={`msg-${paneId}-${item.id}`}
        className={`msg assistant${highlightQuery && item.text.toLowerCase().includes(highlightQuery.toLowerCase()) ? " search-hit" : ""}`}
      >
        <Markdown
          text={item.text}
          dark={dark}
          onClick={(e) => handleMdClick(e, cwd, onPreviewPath)}
        />
        {showCopy ? (
          <div className="actions">
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(item.text)}
              aria-label="复制"
              title="复制"
            >
              <IconCopy size={14} />
              复制
            </button>
          </div>
        ) : null}
      </article>
    );
  }
  if (item.kind === "thought") {
    const preview = item.text.replace(/\s+/g, " ").slice(0, 72);
    return (
      <Fold
        label={preview ? `思考  ${preview}${item.text.length > 72 ? "…" : ""}` : "思考"}
        meta={thoughtDuration(item.at, item.until)}
      >
        <div className="thought">{item.text}</div>
      </Fold>
    );
  }
  if (item.kind === "plan") {
    return (
      <Fold label="计划">
        {item.entries.map((e, i) => (
          <div key={`${e.content}-${i}`}>{e.content}</div>
        ))}
      </Fold>
    );
  }
  if (item.kind === "compact") {
    return (
      <article className="compact-card" aria-label="压缩">
        <strong>{item.phase === "completed" ? "压缩完成" : "开始压缩"}</strong>
        {item.used != null && item.size != null ? (
          <span className="hub-meta">{item.used} / {item.size}</span>
        ) : null}
      </article>
    );
  }
  const stat = diffStatLabel(item.diff);
  const toolLabel = `${item.title || item.toolKind || "工具调用"}${stat ? ` ${stat}` : ""}`;
  return (
    <Fold label={toolLabel} meta={item.status}>
      <button
        type="button"
        className="tool-inspect"
        onClick={() => onInspectTool?.(item)}
      >
        在详情打开
      </button>
      <ToolResult
        title={item.title}
        toolKind={item.toolKind}
        status={item.status}
        detail={undefined}
        diff={item.diff}
        onOpenPath={openPathAbs}
      />
    </Fold>
  );
}

export type ThreadColumnProps = {
  paneId: string;
  chat: ChatState;
  chatWidth: number;
  dark: boolean;
  cwd: string;
  showThinking: boolean;
  empty: boolean;
  emptyTitle: string;
  emptyNode?: ReactNode;
  urlChips: string[];
  plan: ChatState["plan"];
  busy: boolean;
  onCancel: () => void;
  onOpenPlan: (() => void) | null;
  chatRef: RefObject<HTMLDivElement | null>;
  onScroll: (el: HTMLDivElement) => void;
  turns: Extract<ChatItem, { kind: "user" }>[];
  sessionModel?: string | null;
  onResendUser?: (text: string) => void;
  rewindFor?: (itemId: string) => (() => void) | undefined;
  onForkTurn?: (itemId: string) => void;
  onInspectTool?: (item: Extract<ChatItem, { kind: "tool" }>) => void;
  onPreviewPath?: (path: string) => void;
  highlightQuery?: string;
  jumpId?: string | null;
  threadView?: "chat" | "trajectory";
  onThreadView?: (v: "chat" | "trajectory") => void;
  turnFiles?: string[];
  onOpenTurnFile?: (path: string) => void;
};

/** The conversation as a document, plus the tick-mark table of contents. */
export function ThreadColumn({
  paneId,
  chat,
  chatWidth,
  dark,
  cwd,
  showThinking,
  empty,
  emptyTitle,
  emptyNode,
  urlChips,
  plan,
  busy,
  onCancel,
  onOpenPlan,
  chatRef,
  onScroll,
  turns,
  sessionModel,
  onResendUser,
  rewindFor,
  onForkTurn,
  onInspectTool,
  onPreviewPath,
  highlightQuery,
  jumpId,
  threadView = "chat",
  onThreadView,
  turnFiles,
  onOpenTurnFile,
}: ThreadColumnProps) {
  const [tocHover, setTocHover] = useState<{
    top: number;
    left: number;
    text: string;
  } | null>(null);
  const blocks = groupWorkRuns(chat.items);
  let userCount = 0;
  const copyFor = (id: string) => assistantCopyReady(chat.items, id, busy);

  useEffect(() => {
    if (!jumpId) return;
    const el = chatRef.current?.querySelector(`#turn-${paneId}-${jumpId}, #msg-${paneId}-${jumpId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.classList.add("search-hit");
    const t = window.setTimeout(() => el?.classList.remove("search-hit"), 2400);
    return () => window.clearTimeout(t);
  }, [jumpId, paneId, chatRef]);

  return (
    <>
    <div className="chat" ref={chatRef} onScroll={(e) => onScroll(e.currentTarget)}>
      <div
        className="thread"
        style={{ ["--thread" as string]: `${chatWidth}px` }}
      >
        {empty ? (
          emptyNode ?? (
            <div className="empty">
              <p>{emptyTitle}</p>
            </div>
          )
        ) : (
          <>
            {onThreadView ? (
              <div className="thread-tabs" role="tablist" aria-label="对话视图">
                <button type="button" role="tab" aria-selected={threadView === "chat"} className={threadView === "chat" ? "active" : undefined} onClick={() => onThreadView("chat")}>对话</button>
                <button type="button" role="tab" aria-selected={threadView === "trajectory"} className={threadView === "trajectory" ? "active" : undefined} onClick={() => onThreadView("trajectory")}>轨迹</button>
              </div>
            ) : null}
            {turnFiles && turnFiles.length > 0 ? (
              <div className="turn-files" aria-label="本轮产物">
                {turnFiles.map((p) => (
                  <button key={p} type="button" className="path-pill" onClick={() => onOpenTurnFile?.(p)}>
                    {p.split("/").pop() || p}
                  </button>
                ))}
              </div>
            ) : null}
            {threadView === "trajectory" ? (
              <TrajectoryView rows={trajectoryRows(chat.items)} onJump={(id) => {
                const el = chatRef.current?.querySelector(`#turn-${paneId}-${id}, #msg-${paneId}-${id}`);
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
              }} />
            ) : null}
            {threadView !== "trajectory" && urlChips.length > 0 && (
              <div className="url-row">
                {urlChips.map((u) => (
                  <button
                    key={u}
                    className="url-chip"
                    onClick={() => {
                      const t = resolveOpenTarget(u, cwd);
                      if (t) void openPath(t);
                    }}
                  >
                    {u}
                  </button>
                ))}
              </div>
            )}
            {threadView !== "trajectory" && plan.length > 0 && (
              <div className="plan-card">
                <div className="plan-card-head">
                  <strong>计划</strong>
                  {onOpenPlan ? (
                    <button type="button" className="file-open" onClick={onOpenPlan}>
                      查看步骤
                    </button>
                  ) : null}
                </div>
                <ul className="todo">
                  {plan.map((e, i) => (
                    <li key={`${e.content}-${i}`} className={e.status || "pending"}>
                      <span className="box">
                        {e.status === "completed" ? (
                          <IconCheck size={10} />
                        ) : e.status === "in_progress" ? (
                          "•"
                        ) : (
                          ""
                        )}
                      </span>
                      {e.content}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {threadView !== "trajectory" && blocks.map((block) => {
              if (block.kind === "work") {
                const visible = showThinking
                  ? block.items
                  : block.items.filter((i) => i.kind !== "thought");
                if (visible.length === 0) return null;
                return (
                  <div className="work-cluster" key={block.id}>
                    <Fold label={workRunLabel(visible)} meta={workRunMeta(visible)}>
                      {visible.map((item) => (
                        <ChatRow
                          key={item.id}
                          item={item}
                          dark={dark}
                          paneId={paneId}
                          cwd={cwd}
                          sessionModel={sessionModel}
                          showCopy={copyFor(item.id)}
                          onResendUser={onResendUser}
                          rewindFor={rewindFor}
                          onForkTurn={onForkTurn}
                          onInspectTool={onInspectTool}
                          onPreviewPath={onPreviewPath}
                        />
                      ))}
                    </Fold>
                  </div>
                );
              }
              const item = block.item;
              if (item.kind === "thought" && !showThinking) return null;
              if (item.kind === "user") {
                userCount += 1;
                const turn = item.turn ?? userCount - 1;
                return (
                  <Fragment key={item.id}>
                    <div className="turn-sep">{turnSeparatorLabel(turn, item.at)}</div>
                    <ChatRow
                      item={item}
                      dark={dark}
                      paneId={paneId}
                      cwd={cwd}
                      sessionModel={sessionModel}
                      showCopy={copyFor(item.id)}
                      onResendUser={onResendUser}
                      rewindFor={rewindFor}
                      onForkTurn={onForkTurn}
                      onInspectTool={onInspectTool}
                      onPreviewPath={onPreviewPath}
                      highlightQuery={highlightQuery}
                    />
                  </Fragment>
                );
              }
              return (
                <ChatRow
                  key={item.id}
                  item={item}
                  dark={dark}
                  paneId={paneId}
                  cwd={cwd}
                  sessionModel={sessionModel}
                  showCopy={copyFor(item.id)}
                  onResendUser={onResendUser}
                  rewindFor={rewindFor}
                  onForkTurn={onForkTurn}
                  onInspectTool={onInspectTool}
                  onPreviewPath={onPreviewPath}
                />
              );
            })}
            {busy && (
              <button
                type="button"
                className="spark"
                aria-label="停止"
                onClick={onCancel}
              >
                <IconClose size={14} />
              </button>
            )}
          </>
        )}
        </div>
      </div>

      {/* Sits outside the scroll container: absolute children of a scrolling
          element scroll away with the content, which put the table of contents
          out of reach unless you were already at the top. */}
      {turns.length > 1 && (
        <nav className="toc" aria-label="对话目录">
          {turns.map((u) => {
            const tip = u.text.replace(/\s+/g, " ").slice(0, 80);
            return (
              <button
                key={u.id}
                type="button"
                className="toc-tick"
                aria-label={tip}
                onMouseEnter={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setTocHover({
                    top: r.top + r.height / 2,
                    left: r.left,
                    text: tip,
                  });
                }}
                onMouseLeave={() => setTocHover(null)}
                onFocus={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setTocHover({
                    top: r.top + r.height / 2,
                    left: r.left,
                    text: tip,
                  });
                }}
                onBlur={() => setTocHover(null)}
                onClick={() => {
                  chatRef.current
                    ?.querySelector(`#turn-${paneId}-${u.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              />
            );
          })}
        </nav>
      )}
      {tocHover ? (
        <div
          className="toc-tip"
          style={{
            top: tocHover.top,
            left: tocHover.left,
            transform: "translate(calc(-100% - 8px), -50%)",
          }}
        >
          {tocHover.text}
        </div>
      ) : null}
    </>
  );
}
