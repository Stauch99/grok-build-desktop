import {
  Fragment,
  memo,
  useCallback,
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
import { agentChipLabel } from "../lib/agent-chip";
import {
  assistantCopyReady,
  groupWorkRuns,
  lastUserTextBefore,
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
import { IconChevron, IconStop } from "../icons";
import { IconGrokCopy } from "../grok-icons";
import { DotMatrix } from "./DotMatrix";
import { Markdown } from "./Markdown";
import { ToolResult } from "./ToolResult";
import { UserTurn } from "./UserTurn";
import { WorkLiveRow } from "./WorkTimeline";
import { WorkRun } from "./WorkRun";
import { liveWorkBlockId, visibleWorkItems } from "../lib/work-run";
import { latestAssistantText, LIVE_REGION_MS, publishLiveText } from "../lib/live-region";
import { chatWidthCss } from "../lib/chat-width";
import { splitInjectedMemory } from "../lib/memory-inject";
import { tocActiveId } from "../lib/toc-active";
import { latestThreadRowIndex, readyTranscriptPinKey, restoreVirtualScrollIndex, shouldPinReadyTranscript } from "../lib/virtual-scroll-anchor";
import { useT } from "../lib/locale-context";

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
  e.preventDefault();
  if (!target) return;
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
  const t = useT();
  const tone = usageTone(pct, compactPercent);
  const used = usage?.used ?? 0;
  const size = usage?.size;
  const title =
    pct != null && size
      ? t("thread.usagePct", { pct, used, size })
      : t("thread.usageIdle");
  return (
    <span className={`usage-chip usage-chip-${tone}`} aria-label={title}>
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
  const t = useT();
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
      <button type="button" className="wait-stop" onClick={onStop} aria-label={t("thread.stop")}>
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
      <button
        type="button"
        className="fold-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="fold-chev"><IconChevron size={12} /></span>
        <span className="fold-label">{label}</span>
        {meta ? <span className={metaClass}>{meta}</span> : null}
      </button>
      {children ? <div className="fold-body">{children}</div> : null}
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
  retryText,
  onDraftUser,
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
  retryText?: string | null;
  onDraftUser?: (text: string) => void;
}) {
  const t = useT();
  const openPathAbs = (p: string) => {
    const target = p.startsWith("/") ? p : cwd ? `${cwd.replace(/\/$/, "")}/${p}` : p;
    void openPath(target);
  };
  if (item.kind === "user") {
    const clock = item.at != null ? formatClock(item.at) : undefined;
    const visible = splitInjectedMemory(item.text).visible;
    return (
      <div
        id={`turn-${paneId}-${item.id}`}
        data-turn-id={item.id}
        className={`turn-user${highlightQuery && visible.toLowerCase().includes(highlightQuery.toLowerCase()) ? " search-hit" : ""}`}
      >
        <UserTurn
          text={item.text}
          cwd={cwd}
          model={item.model}
          clock={clock || undefined}
          sessionModel={sessionModel}
          onClick={(e) => handleMdClick(e, cwd, onPreviewPath)}
          onCopy={() => void navigator.clipboard.writeText(visible)}
          onResend={() => onResendUser?.(visible)}
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
        <div className="actions">
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(item.text)}
            aria-label={t("thread.copy")}
          >
            <IconGrokCopy />
          </button>
        </div>
      </article>
    );
  }
  if (item.kind === "thought") {
    const preview = item.text.replace(/\s+/g, " ").slice(0, 72);
    return (
      <Fold
        label={preview ? `${t("thread.think")}  ${preview}${item.text.length > 72 ? "…" : ""}` : t("thread.think")}
        meta={thoughtDuration(item.at, item.until)}
      >
        <div className="thought">{item.text}</div>
      </Fold>
    );
  }
  if (item.kind === "plan") {
    return (
      <Fold label={t("thread.plan")}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {item.entries.map((e, i) => (
            <div
              key={`${e.content}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                opacity: e.status === "completed" ? 0.6 : 1,
              }}
            >
              <span
                style={{
                  width: "14px",
                  height: "14px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  borderRadius: "3px",
                  border: "1px solid var(--border, #ccc)",
                  color: e.status === "completed" ? "var(--brand, #10a37f)" : "transparent",
                }}
                aria-hidden
              >
                {e.status === "completed" ? "✓" : ""}
              </span>
              <span
                style={{
                  textDecoration: e.status === "completed" ? "line-through" : undefined,
                }}
              >
                {e.content}
              </span>
            </div>
          ))}
        </div>
      </Fold>
    );
  }
  if (item.kind === "compact") {
    return (
      <article className="compact-card" aria-label={t("thread.compact")}>
        {item.agentId ? <span className="hub-meta">{agentChipLabel(item.agentId)}</span> : null}
        <strong>{item.phase === "completed" ? t("thread.compactDone") : t("thread.compactStart")}</strong>
        {item.used != null && item.size != null ? (
          <span className="hub-meta">{item.used} / {item.size}</span>
        ) : null}
      </article>
    );
  }
  const stat = diffStatLabel(item.diff);
  const toolLabel = `${item.title || item.toolKind || t("tool.call")}${stat ? ` ${stat}` : ""}`;
  const isFail = item.status === "failed";
  return (
    <Fold
      label={toolLabel}
      meta={item.agentId ? `${agentChipLabel(item.agentId)} · ${item.status}` : item.status}
    >
      <ToolResult
        title={item.title}
        toolKind={item.toolKind}
        status={item.status}
        detail={item.detail}
        diff={item.diff}
        onOpenPath={openPathAbs}
        onRetry={
          isFail && onResendUser && retryText
            ? () => onResendUser(retryText)
            : undefined
        }
        onDraft={
          isFail && onDraftUser && retryText
            ? () => onDraftUser(retryText)
            : undefined
        }
      />
    </Fold>
  );
});

const VIRTUALIZE_AFTER = 24;
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
  liveStartedAt?: number;
  stallNote?: string;
  busy: boolean;
  copyReady: (id: string) => boolean;
  lastUser: (id: string) => string | null;
  onResendUser?: (text: string) => void;
  rewindFor?: (itemId: string) => (() => void) | undefined;
  onForkTurn?: (itemId: string) => void;
  onInspectTool?: (item: Extract<ChatItem, { kind: "tool" }>) => void;
  onPreviewPath?: (path: string) => void;
  highlightQuery?: string;
  onCancel: () => void;
  onDraftUser?: (text: string) => void;
  onStopAndRetry?: () => void;
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
    liveStartedAt,
    stallNote,
    busy,
    copyReady,
    lastUser,
    onResendUser,
    rewindFor,
    onForkTurn,
    onInspectTool,
    onPreviewPath,
    highlightQuery,
    onCancel,
    onDraftUser,
    onStopAndRetry,
  } = ctx;
  const copyFor = copyReady;
  if (block.kind === "work") {
    const visible = visibleWorkItems(block.items, showThinking);
    if (visible.length === 0) return null;
    const runBusy = lastWorkId === block.id;
    return (
      <WorkRun
        items={visible}
        busy={runBusy}
        cwd={cwd}
        live={runBusy && busy ? <WorkLiveRow startedAt={liveStartedAt} onStop={onCancel} onStopAndRetry={onStopAndRetry} note={stallNote} /> : null}
        onInspectTool={onInspectTool}
        onRetry={(tool) => {
          const text = lastUser(tool.id);
          if (text) onResendUser?.(text);
        }}
        onDraft={(tool) => {
          const text = lastUser(tool.id);
          if (text) onDraftUser?.(text);
        }}
        onStop={runBusy ? onCancel : undefined}
        runId={block.id}
        startedAt={runBusy ? liveStartedAt : undefined}
      />
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
          highlightQuery={highlightQuery}
          retryText={item.kind === "tool" ? lastUser(item.id) : null}
          onDraftUser={onDraftUser}
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
  busy: boolean;
  onCancel: () => void;
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
  /** When true, keep the viewport on the newest reply (open session / follow stream). */
  pinToLatest?: boolean;
  sessionId?: string | null;
  loading?: boolean;
  onDraftUser?: (text: string) => void;
  stallNote?: string;
  onStopAndRetry?: () => void;
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
  busy,
  onCancel,
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
  pinToLatest = false,
  sessionId = null,
  loading = false,
  onDraftUser,
  stallNote,
  onStopAndRetry,
}: ThreadColumnProps) {
  const t = useT();
  const [tocHover, setTocHover] = useState<{
    top: number;
    left: number;
    text: string;
  } | null>(null);
  const [tocActive, setTocActive] = useState<string | null>(null);
  const wasVirtualRef = useRef(false);
  const anchorIndexRef = useRef(0);
  const liveClock = useRef({ announced: "", lastAt: 0 });
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const blocks = useMemo(() => groupWorkRuns(chat.items), [chat.items]);
  const virtualize = blocks.length > VIRTUALIZE_AFTER;
  const listRef = useListRef(null);
  const rowHeight = useDynamicRowHeight({ defaultRowHeight: 96 });
  const lastWorkId = liveWorkBlockId(blocks, { busy, showThinking });
  const liveInTimeline = lastWorkId != null;
  const liveStartedAt = trailingWorkStartedAt(chat.items);
  const itemsRef = useRef(chat.items);
  itemsRef.current = chat.items;
  const copyReady = useCallback(
    (id: string) => assistantCopyReady(itemsRef.current, id, busy),
    [busy],
  );
  const lastUser = useCallback((id: string) => lastUserTextBefore(itemsRef.current, id), []);
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
      liveStartedAt,
      stallNote,
      busy,
      copyReady,
      lastUser,
      onResendUser,
      rewindFor,
      onForkTurn,
      onInspectTool,
      onPreviewPath,
      highlightQuery,
      onCancel,
      onDraftUser,
      onStopAndRetry,
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
      liveStartedAt,
      stallNote,
      busy,
      copyReady,
      lastUser,
      onResendUser,
      rewindFor,
      onForkTurn,
      onInspectTool,
      onPreviewPath,
      highlightQuery,
      onCancel,
      onDraftUser,
      onStopAndRetry,
    ],
  );
  const listActive = virtualize && !empty;
  const skipVirtualFlip = useRef(true);
  const pinLockUntilRef = useRef(0);
  const lastReadyPinRef = useRef<string | null>(null);
  const lastItemId = chat.items.length > 0 ? chat.items[chat.items.length - 1]?.id : undefined;
  const readyPinKey = readyTranscriptPinKey({ sessionId, loading, lastItemId });

  const reportScroll = (el: HTMLDivElement) => {
    if (performance.now() < pinLockUntilRef.current) return;
    onScroll(el);
  };

  const pinToEnd = (lock: boolean) => {
    if (lock) pinLockUntilRef.current = performance.now() + 400;
    if (listActive) {
      const index = latestThreadRowIndex(blocks.length);
      if (index != null) listRef.current?.scrollToRow({ index, align: "end", behavior: "instant" });
    }
    const el = (listActive ? listRef.current?.element : null) ?? chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useLayoutEffect(() => {
    if (skipVirtualFlip.current) {
      skipVirtualFlip.current = false;
      wasVirtualRef.current = listActive;
      return;
    }
    const next = restoreVirtualScrollIndex(
      wasVirtualRef.current,
      listActive,
      anchorIndexRef.current,
      pinToLatest,
    );
    wasVirtualRef.current = listActive;
    if (next == null) return;
    if (listActive) {
      listRef.current?.scrollToRow({ index: next, align: "start", behavior: "instant" });
      return;
    }
    const block = blocks[next];
    const id = block?.kind === "item" ? block.item.id : null;
    if (id) {
      chatRef.current?.querySelector(`#turn-${paneId}-${id}`)?.scrollIntoView({ block: "start" });
    }
  }, [listActive, blocks, paneId, chatRef, listRef, pinToLatest]);

  useLayoutEffect(() => {
    const next = shouldPinReadyTranscript(lastReadyPinRef.current, readyPinKey);
    lastReadyPinRef.current = next.remember;
    if (!next.pin) return;
    pinToEnd(true);
  }, [readyPinKey]);

  useLayoutEffect(() => {
    if (!pinToLatest || loading) return;
    pinToEnd(false);
  }, [pinToLatest, loading, listActive, blocks.length, chat.items]);

  useEffect(() => {
    const root = (listActive ? listRef.current?.element : chatRef.current) ?? null;
    if (!root || turns.length < 2) return;
    const seen = new Map<string, number>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.turnId;
          if (!id) continue;
          seen.set(id, entry.intersectionRatio);
        }
        const id = tocActiveId([...seen.entries()].map(([id, ratio]) => ({ id, ratio })));
        if (!id) return;
        setTocActive(id);
        const idx = blocks.findIndex((b) => b.kind === "item" && b.item.id === id);
        if (idx >= 0) anchorIndexRef.current = idx;
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    root.querySelectorAll("[data-turn-id]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [listActive, blocks, turns.length, chatRef, listRef]);

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

  return (
    <>
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {liveAnnouncement}
    </div>
    <div
      className={`chat${listActive ? " virtualized" : ""}`}
      ref={listActive ? undefined : chatRef}
      onScroll={listActive ? undefined : (e) => reportScroll(e.currentTarget)}
    >
      <div
        className="thread"
        style={{ ["--thread" as string]: chatWidthCss(chatWidth) }}
      >
        {chat.truncated ? (
          <p className="preview-note" role="status">
            {t("thread.truncated")}
          </p>
        ) : null}
        {empty ? (
          emptyNode ?? (
            <div className="empty">
              <p>{emptyTitle}</p>
            </div>
          )
        ) : (
          <>
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
                onScroll={(e) => reportScroll(e.currentTarget)}
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
            {busy && !liveInTimeline ? (
              <WorkLiveRow startedAt={liveStartedAt} onStop={onCancel} onStopAndRetry={onStopAndRetry} note={stallNote} />
            ) : null}
          </>
        )}
        </div>
      </div>

      {/* Sits outside the scroll container: absolute children of a scrolling
          element scroll away with the content, which put the table of contents
          out of reach unless you were already at the top. */}
      {turns.length > 1 && (
        <nav className="toc" aria-label={t("thread.toc")}>
          {turns.map((u) => {
            const tip = splitInjectedMemory(u.text).visible.replace(/\s+/g, " ").slice(0, 80);
            return (
              <button
                key={u.id}
                type="button"
                className={`toc-tick${tocActive === u.id ? " on" : ""}`}
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
