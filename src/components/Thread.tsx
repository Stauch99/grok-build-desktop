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
import { usageRingDash } from "../lib/usage-split";
import { diffStatLabel } from "../lib/tool-render";
import { resolveOpenTarget } from "../lib/text";
import { IconCheck, IconChevron, IconMarkdown, IconSearch, IconStop } from "../icons";
import { IconGrokCopy } from "../grok-icons";
import { DotMatrix } from "./DotMatrix";
import { ImageLightbox, type LightboxImage } from "./ImageLightbox";
import { Markdown } from "./Markdown";
import { MessageContextMenu, type MsgMenuItem } from "./MessageContextMenu";
import { OutputTail } from "./OutputTail";
import { ThreadFindBar } from "./ThreadFindBar";
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
import { findThreadHits, stepFindIndex } from "../lib/thread-find";
import { nextTurnIndex } from "../lib/turn-nav";
import { collapseToolOutput } from "../lib/output-collapse";
import { formatQuote } from "../lib/selection-actions";
import { MAIN_PANE } from "../lib/pane-tree";

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

const USAGE_MARK_SIZE = 14;
const USAGE_MARK_R = 5;

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
  const { circumference, dash } = usageRingDash(pct ?? 0, USAGE_MARK_R);
  return (
    <span className={`usage-chip usage-chip-${tone}`} aria-label={title}>
      <svg className="usage-ring" width={USAGE_MARK_SIZE} height={USAGE_MARK_SIZE} viewBox={`0 0 ${USAGE_MARK_SIZE} ${USAGE_MARK_SIZE}`} aria-hidden>
        <circle className="usage-ring-track" cx={USAGE_MARK_SIZE / 2} cy={USAGE_MARK_SIZE / 2} r={USAGE_MARK_R} />
        {dash > 0 ? (
          <circle
            className="usage-ring-fill"
            cx={USAGE_MARK_SIZE / 2}
            cy={USAGE_MARK_SIZE / 2}
            r={USAGE_MARK_R}
            strokeDasharray={`${dash} ${circumference}`}
            transform={`rotate(-90 ${USAGE_MARK_SIZE / 2} ${USAGE_MARK_SIZE / 2})`}
          />
        ) : null}
      </svg>
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

/** Icon button with a ~1s "copied" check swap, used on assistant hover actions. */
function ActionCopy({ label, text, icon }: { label: string; text: string; icon: ReactNode }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(id);
  }, [copied]);
  return (
    <button
      type="button"
      aria-label={copied ? t("toast.copied") : label}
      onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))}
    >
      {copied ? <IconCheck size={15} /> : icon}
    </button>
  );
}

/**
 * Rendered text of a message row for context-menu "Copy text". The .md clone
 * drops UI chrome (code-block headers, action buttons) so only prose copies.
 */
export function messagePlainText(row: HTMLElement | null): string {
  const md = row?.querySelector(".md");
  if (!md) return "";
  const clone = md.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".code-head, .actions, .msg-actions").forEach((n) => n.remove());
  return clone.textContent?.trim() ?? "";
}

/** Lightbox caption: the img alt, else the filename tail of a file/asset URL. */
function imageCaption(img: HTMLImageElement): string {
  const alt = img.alt?.trim();
  if (alt) return alt;
  try {
    const path = decodeURIComponent(new URL(img.src).pathname);
    return path.split("/").filter(Boolean).pop() ?? "";
  } catch {
    return "";
  }
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
  findActive = false,
  onMsgContext,
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
  /** Current in-thread find hit — a persistent ring, not the timed flash. */
  findActive?: boolean;
  onMsgContext?: (e: ReactMouseEvent<HTMLElement>, item: ChatItem) => void;
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
        className={`turn-user${highlightQuery && visible.toLowerCase().includes(highlightQuery.toLowerCase()) ? " search-hit" : ""}${findActive ? " find-current" : ""}`}
        onContextMenu={onMsgContext ? (e) => onMsgContext(e, item) : undefined}
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
        className={`msg assistant${highlightQuery && item.text.toLowerCase().includes(highlightQuery.toLowerCase()) ? " search-hit" : ""}${findActive ? " find-current" : ""}`}
        onContextMenu={onMsgContext ? (e) => onMsgContext(e, item) : undefined}
      >
        <Markdown
          text={item.text}
          dark={dark}
          cwd={cwd}
          live={!showCopy}
          onClick={(e) => handleMdClick(e, cwd, onPreviewPath)}
        />
        <div className="actions">
          <ActionCopy label={t("thread.copy")} text={item.text} icon={<IconGrokCopy />} />
          <ActionCopy label={t("thread.copyMarkdown")} text={item.text} icon={<IconMarkdown size={15} />} />
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
  // Long finished output clamps to a head + "… N more lines" tail; running
  // calls (pending/in_progress) keep streaming without a collapse.
  const outCollapse = item.diff
    ? null
    : collapseToolOutput(
        item.detail,
        item.status === "pending" || item.status === "in_progress",
      );
  return (
    <Fold
      label={toolLabel}
      meta={item.agentId ? `${agentChipLabel(item.agentId)} · ${item.status}` : item.status}
    >
      <ToolResult
        title={item.title}
        toolKind={item.toolKind}
        status={item.status}
        detail={outCollapse ? outCollapse.head : item.detail}
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
      {outCollapse ? <OutputTail collapse={outCollapse} /> : null}
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
  /** In-thread find: item id of the current hit, or null. */
  findHitId?: string | null;
  onMsgContext?: (e: ReactMouseEvent<HTMLElement>, item: ChatItem) => void;
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
    findHitId,
    onMsgContext,
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
          findActive={findHitId === item.id}
          onMsgContext={onMsgContext}
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
          findActive={findHitId === item.id}
          onMsgContext={onMsgContext}
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
  // Items that arrived while the user was scrolled up — badge over the jump button.
  const [newSinceScroll, setNewSinceScroll] = useState(0);
  const scrollBaseRef = useRef<number | null>(null);
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
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const copyReady = useCallback(
    (id: string) => assistantCopyReady(itemsRef.current, id, busy),
    [busy],
  );
  const lastUser = useCallback((id: string) => lastUserTextBefore(itemsRef.current, id), []);

  // ---- in-thread find (⌘/Ctrl+F) ----
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIdx, setFindIdx] = useState(0);
  // ---- image lightbox + right-click menu ----
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    item: ChatItem;
    plain: string;
  } | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);

  const findHits = useMemo(
    () => (findOpen ? findThreadHits(blocks, findQuery) : []),
    [findOpen, blocks, findQuery],
  );
  const findCur = findHits.length ? Math.min(Math.max(findIdx, 0), findHits.length - 1) : -1;
  const findHitId = findCur >= 0 ? findHits[findCur].id : null;

  /** Scroll a row into view (virtual or plain) and flash the search-hit ring. */
  const flashAndScroll = useCallback(
    (itemId: string, smooth: boolean) => {
      const hitId = `${paneId}-${itemId}`;
      const sel = `#turn-${hitId}, #msg-${hitId}`;
      const listEl = listRef.current?.element;
      if (listEl?.isConnected) {
        const idx = blocksRef.current.findIndex(
          (b) => b.kind === "item" && b.item.id === itemId,
        );
        if (idx >= 0) {
          listRef.current?.scrollToRow({ index: idx, align: "center", behavior: "instant" });
        }
        void waitForSelector(listEl, sel, 500).then((node) => {
          if (node) applySearchHit(listEl, hitId);
        });
        return;
      }
      const el = chatRef.current?.querySelector(sel);
      el?.scrollIntoView({ behavior: smooth ? "smooth" : "instant", block: "center" });
      applySearchHit(chatRef.current, hitId);
    },
    [paneId, chatRef, listRef],
  );

  /** True when this pane should answer scoped hotkeys (focus inside or hovered). */
  const paneActive = useCallback(() => {
    // .chat-shell wraps the scroller, the TOC, and the find bar — the pane.
    const pane = shellRef.current?.parentElement ?? shellRef.current;
    if (!pane) return false;
    const ae = document.activeElement;
    if (ae && ae !== document.body && pane.contains(ae)) return true;
    if (ae instanceof HTMLElement && ae.closest("input, textarea, [contenteditable=true]")) {
      return false;
    }
    if (pane.matches(":hover")) return true;
    return (ae == null || ae === document.body || ae === document.documentElement) && paneId === MAIN_PANE;
  }, [paneId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.defaultPrevented) return;
      // ⌘/Ctrl+F opens the in-thread find bar for this pane.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "f") {
        if (!paneActive()) return;
        e.preventDefault();
        setFindOpen(true);
        requestAnimationFrame(() => {
          shellRef.current?.parentElement
            ?.querySelector<HTMLInputElement>(".thread-find input")
            ?.focus();
        });
        return;
      }
      // Esc closes the find bar when it or this pane holds focus; modal/menu
      // Esc handling elsewhere is left alone.
      if (e.key === "Escape" && findOpen) {
        const inFind = e.target instanceof Element && !!e.target.closest(".thread-find");
        if (!inFind && !paneActive()) return;
        e.preventDefault();
        e.stopPropagation();
        setFindOpen(false);
        return;
      }
      // Alt+↑/↓ jump between user turns.
      if (
        e.altKey && !e.metaKey && !e.ctrlKey &&
        (e.key === "ArrowUp" || e.key === "ArrowDown")
      ) {
        if (!paneActive()) return;
        const ids = turns.map((u) => u.id);
        const next = nextTurnIndex(ids, tocActive, e.key === "ArrowDown" ? 1 : -1);
        if (next < 0) return;
        e.preventDefault();
        setTocActive(ids[next]);
        flashAndScroll(ids[next], false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [paneActive, findOpen, turns, tocActive, flashAndScroll]);

  // Keep the current find hit scrolled into view + ringed.
  useEffect(() => {
    if (!findOpen || !findHitId) return;
    flashAndScroll(findHitId, true);
  }, [findOpen, findHitId, flashAndScroll]);

  // Right-click on a user/assistant row → message menu at the cursor.
  const onMsgContext = useCallback((e: ReactMouseEvent<HTMLElement>, item: ChatItem) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      item,
      plain: messagePlainText(e.currentTarget),
    });
  }, []);

  const ctxMenuItems = useMemo((): MsgMenuItem[] => {
    if (!ctxMenu) return [];
    const { item, plain } = ctxMenu;
    // The menu only attaches to user/assistant rows; keep the fallback total.
    const raw =
      item.kind === "user" ? splitInjectedMemory(item.text).visible
      : "text" in item ? item.text
      : "";
    // User text is already plain; DOM textContent would drop <br> newlines.
    const copyText = item.kind === "user" ? raw : plain || raw;
    const items: MsgMenuItem[] = [
      {
        id: "copy-text",
        label: t("thread.copyText"),
        onSelect: () => void navigator.clipboard.writeText(copyText),
      },
      {
        id: "copy-md",
        label: t("thread.copyMarkdown"),
        onSelect: () => void navigator.clipboard.writeText(raw),
      },
    ];
    if (onDraftUser) {
      items.push({
        id: "quote",
        label: t("selection.quote"),
        onSelect: () => onDraftUser(`${formatQuote(raw)}\n\n`),
      });
    }
    if (item.kind === "user") {
      const rewind = rewindFor?.(item.id);
      if (rewind) items.push({ id: "rewind", label: t("thread.rewindHere"), onSelect: rewind });
      if (onForkTurn) {
        items.push({ id: "fork", label: t("thread.forkHere"), onSelect: () => onForkTurn(item.id) });
      }
    }
    return items;
  }, [ctxMenu, onDraftUser, rewindFor, onForkTurn, t]);

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
      findHitId,
      onMsgContext,
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
      findHitId,
      onMsgContext,
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

  // pinToLatest is the pane's atBottom flag: the baseline freezes when it flips
  // off and clears when the user returns to the bottom.
  useEffect(() => {
    const len = chat.items.length;
    if (pinToLatest) {
      scrollBaseRef.current = null;
      setNewSinceScroll(0);
      return;
    }
    if (scrollBaseRef.current == null || len < scrollBaseRef.current) {
      scrollBaseRef.current = len;
    }
    setNewSinceScroll(len - scrollBaseRef.current);
  }, [pinToLatest, chat.items.length]);

  // Rebuild the TOC observer only when the set of user turns changes — `blocks`
  // gets a fresh identity on every streaming flush, so key off the joined ids.
  const turnKey = turns.map((u) => u.id).join("\0");
  useEffect(() => {
    const root = (listActive ? listRef.current?.element : chatRef.current) ?? null;
    if (!root || turns.length < 2) return;
    const seen = new Map<string, { ratio: number; el: Element }>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.turnId;
          if (!id) continue;
          seen.set(id, { ratio: entry.intersectionRatio, el: entry.target });
        }
        const id = tocActiveId(
          [...seen.entries()]
            .filter(([, v]) => v.el.isConnected)
            .map(([id, v]) => ({ id, ratio: v.ratio })),
        );
        if (!id) return;
        setTocActive(id);
        const idx = blocksRef.current.findIndex((b) => b.kind === "item" && b.item.id === id);
        if (idx >= 0) anchorIndexRef.current = idx;
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    root.querySelectorAll("[data-turn-id]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [listActive, turnKey, turns.length, chatRef, listRef]);

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
      ref={(el) => {
        shellRef.current = el;
        if (!listActive) chatRef.current = el;
      }}
      onScroll={listActive ? undefined : (e) => reportScroll(e.currentTarget)}
      onClickCapture={(e) => {
        // Images inside message markdown open the lightbox before the
        // row-level link handler can claim the click.
        const el = e.target;
        if (!(el instanceof HTMLImageElement) || !el.closest(".md")) return;
        const scope = el.closest(".msg") ?? el.closest(".thread");
        const imgs = scope
          ? [...scope.querySelectorAll<HTMLImageElement>(".md img")]
          : [el];
        const images: LightboxImage[] = imgs.map((img) => ({
          src: img.currentSrc || img.src,
          name: imageCaption(img),
        }));
        if (!images.length) return;
        e.preventDefault();
        e.stopPropagation();
        setLightbox({ images, index: Math.max(0, imgs.indexOf(el)) });
      }}
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

      {/* Find bar + trigger sit outside the scroller so they stay pinned. */}
      {!empty && !findOpen ? (
        <button
          type="button"
          className="thread-find-btn"
          aria-label={t("thread.find")}
          onClick={() => setFindOpen(true)}
        >
          <IconSearch size={14} />
        </button>
      ) : null}
      {findOpen ? (
        <ThreadFindBar
          query={findQuery}
          index={findCur}
          total={findHits.length}
          onQuery={(q) => {
            setFindQuery(q);
            setFindIdx(0);
          }}
          onStep={(dir) => setFindIdx((i) => stepFindIndex(i, dir, findHits.length))}
          onClose={() => setFindOpen(false)}
        />
      ) : null}
      {lightbox ? (
        <ImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          onIndex={(i) => setLightbox((s) => (s ? { ...s, index: i } : s))}
          onClose={() => setLightbox(null)}
        />
      ) : null}
      {ctxMenu ? (
        <MessageContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenuItems}
          onClose={() => setCtxMenu(null)}
        />
      ) : null}

      {!pinToLatest && newSinceScroll > 0 ? (
        <span className="jump-count" aria-hidden="true">
          {newSinceScroll}
        </span>
      ) : null}

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
