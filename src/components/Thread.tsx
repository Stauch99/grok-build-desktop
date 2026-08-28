import {
  Fragment,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { List, useDynamicRowHeight, useListRef, type RowComponentProps } from "react-window";
import { openPath } from "../api";
import { applySearchHit, waitForSelector } from "../lib/search-hit";
import {
  assistantCopyReady,
  groupWorkRuns,
  trailingWorkStartedAt,
  type ChatItem,
  type ChatState,
  type ThreadBlock,
} from "../lib/chat";
import {
  formatClock,
  thoughtDuration,
  turnSeparatorLabel,
  usageTone,
} from "../lib/time";
import { diffStatLabel } from "../lib/tool-render";
import { resolveOpenTarget } from "../lib/text";
import { IconChevron, IconListDetails, IconStop } from "../icons";
import { IconGrokCopy } from "../grok-icons";
import { DotMatrix } from "./DotMatrix";
import { TodoMark } from "./TodoMark";
import { Markdown } from "./Markdown";
import { ToolResult } from "./ToolResult";
import { TrajectoryView } from "./TrajectoryView";
import { trajectoryRows } from "../lib/trajectory";
import { UserTurn } from "./UserTurn";
import { WorkLiveRow, WorkTimeline } from "./WorkTimeline";
import { SessionOutline } from "./SessionOutline";
import { shouldShowSummary, summarizeThread } from "../lib/session-summary";
import { exportSessionFile, parseSessionImport, viewOnlyItems } from "../lib/session-io";
import { latestAssistantText, LIVE_REGION_MS, publishLiveText } from "../lib/live-region";

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
      <button type="button" className="wait-stop" onClick={onStop} title="停止" aria-label="停止">
        <IconStop size={16} />
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

export const ChatRow = memo(function ChatRow({
  item,
  dark,
  paneId = "main",
  cwd = "",
  sessionModel,
  showCopy = true,
  onResendUser,
  rewindFor,
  onForkTurn,
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
          cwd={cwd}
          live={!showCopy}
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
              <IconGrokCopy />
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
});

const VIRTUALIZE_AFTER = 80;
const LIST_OVERSCAN = 8;

type ThreadRowCtx = {
  paneId: string;
  dark: boolean;
  cwd: string;
  showThinking: boolean;
  sessionModel?: string | null;
  blocks: ThreadBlock[];
  lastWorkId: string | null;
  liveInTimeline: boolean;
  liveRow: ReactNode;
  busy: boolean;
  items: ChatItem[];
  onResendUser?: (text: string) => void;
  rewindFor?: (itemId: string) => (() => void) | undefined;
  onForkTurn?: (itemId: string) => void;
  onInspectTool?: (item: Extract<ChatItem, { kind: "tool" }>) => void;
  onPreviewPath?: (path: string) => void;
  highlightQuery?: string;
};

function userTurnsBefore(blocks: ThreadBlock[], index: number): number {
  let n = 0;
  for (let i = 0; i < index; i++) {
    const b = blocks[i];
    if (b.kind === "item" && b.item.kind === "user") n += 1;
  }
  return n;
}

function threadRowKey(index: number, data: ThreadRowCtx): string {
  const block = data.blocks[index];
  return block.kind === "work" ? block.id : block.item.id;
}

function ThreadBlockView({
  block,
  index,
  ctx,
}: {
  block: ThreadBlock;
  index: number;
  ctx: ThreadRowCtx;
}) {
  const {
    paneId,
    dark,
    cwd,
    showThinking,
    sessionModel,
    lastWorkId,
    liveInTimeline,
    liveRow,
    items,
    busy,
    onResendUser,
    rewindFor,
    onForkTurn,
    onInspectTool,
    onPreviewPath,
    highlightQuery,
  } = ctx;
  const copyFor = (id: string) => assistantCopyReady(items, id, busy);
  if (block.kind === "work") {
    const visible = showThinking
      ? block.items
      : block.items.filter((i) => i.kind !== "thought");
    if (visible.length === 0) return null;
    const runBusy = liveInTimeline && lastWorkId === block.id;
    return (
      <div className="work-cluster">
        <WorkTimeline
          items={visible}
          busy={runBusy}
          cwd={cwd}
          live={runBusy ? liveRow : null}
          onInspectTool={onInspectTool}
        />
      </div>
    );
  }
  const item = block.item;
  if (item.kind === "thought" && !showThinking) return null;
  if (item.kind === "user") {
    const userCount = userTurnsBefore(ctx.blocks, index) + 1;
    const turn = item.turn ?? userCount - 1;
    return (
      <Fragment>
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
}

function VirtualThreadRow({
  index,
  style,
  ariaAttributes,
  ...ctx
}: RowComponentProps<ThreadRowCtx>) {
  return (
    <div style={style} {...ariaAttributes}>
      <ThreadBlockView block={ctx.blocks[index]} index={index} ctx={ctx} />
    </div>
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
  /** Outline / export jump. Prefer setting `jumpTurnId` in the parent. */
  onJumpTurn?: (id: string) => void;
  /** Import JSON as view-only chat items. Parent owns chat state. */
  onImportItems?: (items: ChatItem[]) => void;
  sessionTitle?: string;
};

/** The conversation column: narrative, work timeline, and the tick-mark table of contents. */
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
  onJumpTurn,
  onImportItems,
  sessionTitle,
}: ThreadColumnProps) {
  const [tocHover, setTocHover] = useState<{
    top: number;
    left: number;
    text: string;
  } | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [, setLiveTick] = useState(0);
  const liveClock = useRef({ announced: "", lastAt: 0 });
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const blocks = useMemo(() => groupWorkRuns(chat.items), [chat.items]);
  const virtualize = blocks.length > VIRTUALIZE_AFTER;
  const listRef = useListRef(null);
  const rowHeight = useDynamicRowHeight({ defaultRowHeight: 72 });
  const lastBlock = blocks[blocks.length - 1];
  const lastWorkVisible =
    lastBlock?.kind === "work" &&
    (showThinking ? lastBlock.items : lastBlock.items.filter((i) => i.kind !== "thought"))
      .length > 0;
  const liveInTimeline = busy && lastWorkVisible;
  const liveStartedAt = trailingWorkStartedAt(chat.items);
  const liveRow = busy ? <WorkLiveRow startedAt={liveStartedAt} onStop={onCancel} /> : null;
  const lastWorkId = lastBlock?.kind === "work" ? lastBlock.id : null;
  const rowCtx = useMemo(
    (): ThreadRowCtx => ({
      paneId,
      dark,
      cwd,
      showThinking,
      sessionModel,
      blocks,
      lastWorkId,
      liveInTimeline,
      liveRow,
      busy,
      items: chat.items,
      onResendUser,
      rewindFor,
      onForkTurn,
      onInspectTool,
      onPreviewPath,
      highlightQuery,
    }),
    [
      paneId,
      dark,
      cwd,
      showThinking,
      sessionModel,
      blocks,
      lastWorkId,
      liveInTimeline,
      liveRow,
      busy,
      chat.items,
      onResendUser,
      rewindFor,
      onForkTurn,
      onInspectTool,
      onPreviewPath,
      highlightQuery,
    ],
  );
  const listActive = virtualize && threadView === "chat" && !empty;

  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => setLiveTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [busy]);

  useEffect(() => {
    const latest = latestAssistantText(chat.items);
    const apply = (flush: boolean) => {
      const next = publishLiveText(liveClock.current, latest, Date.now(), { flush });
      if (next === liveClock.current) return;
      liveClock.current = next;
      setLiveAnnouncement(next.announced);
    };
    apply(!busy);
    if (!busy) return;
    const id = window.setInterval(() => apply(false), LIVE_REGION_MS);
    return () => window.clearInterval(id);
  }, [chat.items, busy]);

  useLayoutEffect(() => {
    if (!listActive) return;
    const sync = () => {
      const el = listRef.current?.element;
      if (el) chatRef.current = el;
    };
    sync();
    const raf = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(raf);
  }, [listActive, chatRef, listRef]);

  useEffect(() => {
    if (!jumpId) return;
    const hitId = `${paneId}-${jumpId}`;
    if (listActive) {
      const idx = blocks.findIndex((b) => b.kind === "item" && b.item.id === jumpId);
      if (idx >= 0) listRef.current?.scrollToRow({ index: idx, align: "center", behavior: "instant" });
      const root = listRef.current?.element ?? chatRef.current;
      let cancelled = false;
      let clear = () => {};
      void waitForSelector(root, `#turn-${hitId}, #msg-${hitId}`, 500).then((node) => {
        if (cancelled || !node) return;
        clear = applySearchHit(root, hitId);
      });
      return () => {
        cancelled = true;
        clear();
      };
    }
    const el = chatRef.current?.querySelector(`#turn-${hitId}, #msg-${hitId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    return applySearchHit(chatRef.current, hitId);
    // Read blocks from this render. Listing them re-flashes while jumpId stays set.
  }, [jumpId, listActive, paneId, chatRef]);

  function jumpToTurn(id: string) {
    onJumpTurn?.(id);
    if (listActive) {
      const idx = blocks.findIndex((b) => b.kind === "item" && b.item.id === id);
      if (idx >= 0) listRef.current?.scrollToRow({ index: idx, align: "start", behavior: "smooth" });
      return;
    }
    chatRef.current
      ?.querySelector(`#turn-${paneId}-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function importJsonFile(file: File) {
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      const parsed = parseSessionImport(raw);
      if (!parsed.ok) {
        setImportError(parsed.error);
        return;
      }
      if (!onImportItems) {
        setImportError("已解析为只读记录，等待接入会话");
        return;
      }
      onImportItems(viewOnlyItems(parsed.value.items));
    };
    reader.onerror = () => setImportError("读取文件失败");
    reader.readAsText(file);
  }

  return (
    <>
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {liveAnnouncement}
    </div>
    <div
      className={`chat${listActive ? " virtualized" : ""}`}
      ref={listActive ? undefined : chatRef}
      onScroll={listActive ? undefined : (e) => onScroll(e.currentTarget)}
    >
      <div
        className="thread"
        style={{ ["--thread" as string]: `${chatWidth}px` }}
      >
        {empty ? (
          <>
            <div className="thread-session-tools">
              <label className="thread-import">
                导入 JSON
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) importJsonFile(file);
                  }}
                />
              </label>
            </div>
            {importError ? <p className="hint thread-import-error">{importError}</p> : null}
            {emptyNode ?? (
              <div className="empty">
                <p>{emptyTitle}</p>
              </div>
            )}
          </>
        ) : (
          <>
            {onThreadView ? (
              <div className="thread-tabs" role="tablist" aria-label="对话视图">
                <button type="button" role="tab" aria-selected={threadView === "chat"} className={threadView === "chat" ? "active" : undefined} onClick={() => onThreadView("chat")}>对话</button>
                <button type="button" role="tab" aria-selected={threadView === "trajectory"} className={threadView === "trajectory" ? "active" : undefined} onClick={() => onThreadView("trajectory")}>轨迹</button>
              </div>
            ) : null}
            <div className="thread-session-tools">
              <button
                type="button"
                className={outlineOpen ? "active" : undefined}
                onClick={() => setOutlineOpen((v) => !v)}
              >
                大纲
              </button>
              <button type="button" onClick={() => exportSessionFile(chat.items, "md", sessionTitle)}>
                导出 MD
              </button>
              <button type="button" onClick={() => exportSessionFile(chat.items, "json", sessionTitle)}>
                导出 JSON
              </button>
              <label className="thread-import">
                导入 JSON
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) importJsonFile(file);
                  }}
                />
              </label>
            </div>
            {importError ? <p className="hint thread-import-error">{importError}</p> : null}
            {outlineOpen ? <SessionOutline turns={turns} onJump={jumpToTurn} /> : null}
            {shouldShowSummary(chat.items) ? (
              <details className="thread-summary">
                <summary>对话回顾</summary>
                <p>{summarizeThread(chat.items)}</p>
              </details>
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
              <div className="pane-in" key="trajectory">
              <TrajectoryView rows={trajectoryRows(chat.items)} onJump={(id) => {
                const el = chatRef.current?.querySelector(`#turn-${paneId}-${id}, #msg-${paneId}-${id}`);
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
              }} />
              </div>
            ) : (
              <div className="pane-in" key="chat">
            {urlChips.length > 0 && (
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
            {plan.length > 0 && (
              <div className="plan-card">
                <div className="plan-card-head">
                  <strong>计划</strong>
                  {onOpenPlan ? (
                    <button type="button" className="file-open" onClick={onOpenPlan} title="查看步骤" aria-label="查看步骤">
                      <IconListDetails size={14} />
                    </button>
                  ) : null}
                </div>
                <ul className="todo">
                  {plan.map((e, i) => (
                    <li key={`${e.content}-${i}`} className={e.status || "pending"}>
                      <TodoMark status={e.status} />
                      {e.content}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {virtualize ? (
              <List
                className="thread-list"
                listRef={listRef}
                rowComponent={VirtualThreadRow}
                rowCount={blocks.length}
                rowHeight={rowHeight}
                rowProps={rowCtx}
                rowKey={threadRowKey}
                overscanCount={LIST_OVERSCAN}
                onScroll={(e) => onScroll(e.currentTarget)}
              />
            ) : (
              blocks.map((block, index) => (
                <ThreadBlockView
                  key={threadRowKey(index, rowCtx)}
                  block={block}
                  index={index}
                  ctx={rowCtx}
                />
              ))
            )}
            {busy && !liveInTimeline ? liveRow : null}
              </div>
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
                  if (listActive) {
                    const idx = blocks.findIndex((b) => b.kind === "item" && b.item.id === u.id);
                    if (idx >= 0) {
                      listRef.current?.scrollToRow({ index: idx, align: "start", behavior: "smooth" });
                    }
                    return;
                  }
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
