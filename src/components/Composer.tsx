import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { AgentChip } from "./AgentChip";
import { AttachStrip } from "./AttachStrip";
import { ComposerChips } from "./ComposerChips";
import type { AgentId } from "../lib/agent-id";
import { MentionMenu } from "./MentionMenu";
import { QueueStrip } from "./QueueStrip";
import { SlashMenu } from "./SlashMenu";
import { IconGrokPlus } from "../grok-icons";
import { IconChevron, IconUp } from "../icons";
import {
  addAttachments,
  ATTACHMENT_CAP,
  formatAttachmentsPrompt,
  isFileDrag,
  pathsFromDataTransfer,
  pathsFromTauriDrop,
  resolveAttachPath,
  type Attachment,
} from "../lib/attachments";
import { readTextFile, statAttachment } from "../api";
import { filterCommands, type CommandDef } from "../lib/commands";
import { type Effort } from "../lib/effort";
import { modeNeedsConfirm, nextMode, type Mode } from "../lib/mode";
import type { SlashCommand } from "../lib/chat";
import {
  applyMentionPickIfCurrent,
  beginMentionPick,
  canAttachMentionContent,
  filterMentions,
  mentionMenuVisible,
  mentionPath,
  mentionRequestIsCurrent,
  resolveMentionReadPath,
  type MentionHit,
} from "../lib/mentions";
import { type QueueState } from "../lib/prompt-queue";
import {
  applyImeComposition,
  emptyImeEnterState,
  imeBlocksEnter,
} from "../lib/ime-enter";

export type ComposerHandle = {
  focus: () => void;
  /** Put text in the box and focus it — used by slash commands that expect an argument. */
  setText: (text: string) => void;
};

export type ComposerProps = {
  value: string;
  onChange: (next: string) => void;
  /** Primary action. While `busy` the parent decides whether that means queue or steer. */
  onSend: (text: string) => void;
  /** Secondary action offered only while busy — the one `onSend` did not do. */
  onAlt?: (text: string) => void;
  /** Label for the secondary action, e.g. "改向" or "排队". */
  altLabel?: string;
  busy: boolean;
  /** No workspace yet, or the session is still loading. */
  blocked?: boolean;
  enterSends: boolean;
  placeholder?: string;
  /** CSS measure for the column. Always the chatWidth cap — never 100% on split. */
  threadWidth: string;

  commands: SlashCommand[];
  onRunSlash: (cmd: CommandDef, rest: string) => void;

  cwd: string;
  listFiles: (query: string) => Promise<string[]>;
  /** Optional file reader for “附带内容”. Falls back to `readTextFile`. */
  readFile?: (path: string) => Promise<string>;
  /** Relative folder paths offered in @-mentions. */
  mentionDirs?: string[];
  /** Git working-tree relative paths for @-mentions and "本次改动". */
  mentionChanges?: string[];

  mode: Mode;
  onMode: (next: Mode) => void;

  effort: Effort;
  onEffort: (next: Effort) => void;
  /** When false, effort chip shows default but does not persist yet. */
  effortReady?: boolean;

  model: string;
  /** Model this session actually runs on, when it differs from the default. */
  sessionModel?: string | null;
  modelOptions: string[];
  onModel: (next: string) => void;
  onOpenSettings: () => void;
  onManageSkills?: () => void;
  /** Session-level /model. Falls back to onModel when omitted. */
  onSessionModel?: (next: string) => void;

  queue: QueueState;
  onRemoveQueued: (id: number) => void;
  onReorderQueued?: (from: number, to: number) => void;
  onEditQueued?: (id: number, text: string) => void;
  /** Hide the input while a permission / question / plan card covers it. */
  takeover?: "permission" | "question" | "plan" | "bar";
  busyHint?: string;

  /** Rendered above the input: permission card, wait pill, memory dock. */
  children?: React.ReactNode;

  /** Quiet caption under the input box, outside `.composer`. */
  footer?: React.ReactNode;
  /** Fork / context-use chips on the same row as the folder and TTFT. */
  metaActions?: React.ReactNode;

  /** Called when a drop would exceed the attachment cap. */
  onOverflow?: (msg: string) => void;

  workspaceLabel?: string;
  workspaceOptions?: Array<{ path: string; label: string }>;
  onWorkspace?: (path: string) => void;

  selectedAgentId: AgentId;
  onSelectedAgent: (id: AgentId) => void;
  hasOpenSession: boolean;
};

function growArea(el: HTMLTextAreaElement | null, max = 200) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(Math.max(el.scrollHeight, 42), max)}px`;
}

/**
 * The prompt box and everything docked to it. Each pane mounts its own
 * instance, so slash / mention / mode / model menu state is per-pane —
 * opening the mode menu on the left no longer opens it on the right.
 */
export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  {
    value,
    onChange,
    onSend,
    onAlt,
    altLabel,
    busy,
    blocked = false,
    enterSends,
    placeholder = "回复…",
    threadWidth,
    commands,
    onRunSlash,
    cwd,
    listFiles,
    readFile,
    mentionDirs,
    mentionChanges,
    mode,
    onMode,
    effort,
    onEffort,
    effortReady = true,
    model,
    sessionModel,
    modelOptions,
    onModel,
    onOpenSettings,
    onManageSkills,
    onSessionModel,
    queue,
    onRemoveQueued,
    onReorderQueued,
    onEditQueued,
    takeover = "bar",
    busyHint,
    children,
    footer,
    metaActions,
    onOverflow,
    workspaceLabel,
    workspaceOptions,
    onWorkspace,
    selectedAgentId,
    onSelectedAgent,
    hasOpenSession,
  },
  ref,
) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileDragDepthRef = useRef(0);
  const html5DropRef = useRef(false);
  const mentionGenerationRef = useRef(0);
  const mentionQueryRef = useRef("");
  const mentionVisibleRef = useRef(false);
  const mentionOwnerRef = useRef(cwd);
  const imeRef = useRef(emptyImeEnterState());
  const mentionEffectOwnerRef = useRef(cwd);
  mentionOwnerRef.current = cwd;
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fileDragOver, setFileDragOver] = useState(false);
  const [slashOn, setSlashOn] = useState(false);
  const [slashHits, setSlashHits] = useState<CommandDef[]>([]);
  const [mentionOn, setMentionOn] = useState(false);
  const [mentions, setMentions] = useState<MentionHit[]>([]);
  const [mentionActive, setMentionActive] = useState(0);
  const [includeContent, setIncludeContent] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [modeArmed, setModeArmed] = useState<Mode | null>(null);
  const [effortOpen, setEffortOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus(),
    setText: (text: string) => {
      onChange(text);
      taRef.current?.focus();
    },
  }));

  useEffect(() => {
    growArea(taRef.current);
  }, [value]);

  useEffect(() => {
    if (mentionEffectOwnerRef.current === cwd) return;
    mentionEffectOwnerRef.current = cwd;
    mentionGenerationRef.current += 1;
    mentionQueryRef.current = "";
    mentionVisibleRef.current = false;
    setMentions([]);
    setMentionOn(false);
  }, [cwd]);

  const mergeAttachments = useCallback(
    (incoming: Attachment[]) => {
      if (incoming.length === 0) return;
      setAttachments((prev) => {
        const { next, dropped } = addAttachments(prev, incoming);
        if (dropped > 0) {
          onOverflow?.(`最多 ${ATTACHMENT_CAP} 个附件，已忽略 ${dropped} 个`);
        }
        return next;
      });
    },
    [onOverflow],
  );

  const ingestPaths = useCallback(
    async (paths: { path: string; kind: "file" | "dir"; bytes?: number }[]) => {
      const incoming: Attachment[] = [];
      for (const p of paths) {
        const result = await resolveAttachPath(p, (path) => statAttachment(path, cwd || null));
        if ("reason" in result) {
          onOverflow?.(result.reason);
          continue;
        }
        incoming.push(result.attachment);
      }
      mergeAttachments(incoming);
    },
    [cwd, mergeAttachments, onOverflow],
  );

  const pointInWrap = useCallback((x: number, y: number) => {
    const el = wrapRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }, []);

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const { payload } = event;
        const scale = window.devicePixelRatio || 1;

        if (payload.type === "enter" || payload.type === "over") {
          const x = payload.position.x / scale;
          const y = payload.position.y / scale;
          setFileDragOver(pointInWrap(x, y));
          return;
        }

        if (payload.type === "leave") {
          setFileDragOver(false);
          return;
        }

        if (payload.type !== "drop") return;
        setFileDragOver(false);
        if (html5DropRef.current) {
          html5DropRef.current = false;
          return;
        }

        const x = payload.position.x / scale;
        const y = payload.position.y / scale;
        if (!pointInWrap(x, y)) return;

        const incoming = pathsFromTauriDrop(payload.paths);
        void ingestPaths(incoming.map((a) => ({ path: a.path, kind: a.kind, bytes: a.bytes })));
      })
      .then((fn) => {
        if (alive) unlisten = fn;
        else fn();
      })
      .catch(() => {
        /* HTML5 drop is enough in dev browser */
      });

    return () => {
      alive = false;
      unlisten?.();
    };
  }, [ingestPaths, pointInWrap]);

  useEffect(() => {
    if (!modeOpen && !effortOpen && !modelOpen && !wsOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (t instanceof Element && t.closest(".chip-wrap")) return;
      setModeOpen(false);
      setEffortOpen(false);
      setModelOpen(false);
      setWsOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setModeOpen(false);
      setEffortOpen(false);
      setModelOpen(false);
      setWsOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [modeOpen, effortOpen, modelOpen, wsOpen]);

  async function handleChange(next: string) {
    onChange(next);
    if (next.startsWith("/")) {
      setSlashOn(true);
      setSlashHits(filterCommands(next, commands));
      mentionVisibleRef.current = false;
      mentionGenerationRef.current += 1;
      setMentionOn(false);
      return;
    }
    setSlashOn(false);
    if (cwd && mentionMenuVisible(next)) {
      const at = next.lastIndexOf("@");
      const q = next.slice(at + 1).split(/\s/)[0];
      const generation = ++mentionGenerationRef.current;
      const requestOwner = mentionOwnerRef.current;
      mentionQueryRef.current = q;
      mentionVisibleRef.current = true;
      setMentionOn(true);
      setMentionActive(0);
      try {
        const files = await listFiles(q);
        if (!mentionRequestIsCurrent({ requestGeneration: generation, currentGeneration: mentionGenerationRef.current, requestQuery: q, currentQuery: mentionQueryRef.current, visible: mentionVisibleRef.current, requestOwner, currentOwner: mentionOwnerRef.current })) return;
        setMentions(filterMentions({ query: q, files, dirs: mentionDirs, changes: mentionChanges }));
      } catch {
        if (mentionRequestIsCurrent({ requestGeneration: generation, currentGeneration: mentionGenerationRef.current, requestQuery: q, currentQuery: mentionQueryRef.current, visible: mentionVisibleRef.current, requestOwner, currentOwner: mentionOwnerRef.current })) setMentions([]);
      }
      return;
    }
    mentionVisibleRef.current = false;
    mentionGenerationRef.current += 1;
    setMentionOn(false);
  }

  function openSlashPalette() {
    onChange("/");
    setSlashOn(true);
    setSlashHits(filterCommands("/", commands));
    taRef.current?.focus();
  }

  function runSlash(cmd: CommandDef, rest = "") {
    setSlashOn(false);
    onRunSlash(cmd, rest);
  }

  function promptText(): string {
    return formatAttachmentsPrompt(attachments, value);
  }

  function clearAttachments() {
    setAttachments([]);
  }

  function dispatchSend(send: (text: string) => void) {
    const text = promptText();
    if (!text.trim() || blocked) return;
    send(text);
    clearAttachments();
  }

  function removeAttachment(path: string) {
    setAttachments((prev) => prev.filter((a) => a.path !== path));
  }

  function onFileDragEnter(e: DragEvent) {
    if (!isFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    fileDragDepthRef.current += 1;
    setFileDragOver(true);
  }

  function onFileDragLeave(e: DragEvent) {
    if (!isFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1);
    if (fileDragDepthRef.current === 0) setFileDragOver(false);
  }

  function onFileDragOver(e: DragEvent) {
    if (!isFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setFileDragOver(true);
  }

  async function onFileDrop(e: DragEvent) {
    if (!isFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    fileDragDepthRef.current = 0;
    setFileDragOver(false);
    html5DropRef.current = true;

    const paths = await pathsFromDataTransfer(e.dataTransfer);
    if (paths.length > 0) {
      void ingestPaths(paths);
      return;
    }

    html5DropRef.current = false;
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
      if (e.key === "Tab" && e.shiftKey) {
      if (slashOn || mentionOn) return;
      e.preventDefault();
      const next = nextMode(mode);
      if (modeNeedsConfirm(mode, next)) {
        setModeArmed(next);
        return;
      }
      onMode(next);
      return;
    }
    if (e.key === "Escape" && (slashOn || mentionOn)) {
      e.preventDefault();
      e.stopPropagation();
      setSlashOn(false);
      mentionVisibleRef.current = false;
      mentionGenerationRef.current += 1;
      setMentionOn(false);
      return;
    }
    if (e.key !== "Enter" || e.shiftKey) return;
    if (
      imeBlocksEnter(
        { key: e.key, isComposing: e.nativeEvent.isComposing, keyCode: e.nativeEvent.keyCode },
        imeRef.current,
        Date.now(),
      )
    ) {
      return;
    }

    const mod = e.metaKey || e.ctrlKey;
    const sendKey = enterSends ? !mod : mod;
    const altKey = enterSends ? mod : !mod;

    if (busy) {
      if (!sendKey && !altKey) return;
      e.preventDefault();
      if (slashOn && slashHits[0] && sendKey) {
        const name = value.split(/\s/)[0];
        const exact = slashHits.find((c) => c.name === name);
        const cmd = exact ?? slashHits[0];
        runSlash(cmd, exact ? value.slice(name.length).trimStart() : "");
        return;
      }
      if (sendKey) {
        dispatchSend(onSend);
      } else if (onAlt) {
        dispatchSend(onAlt);
      } else {
        dispatchSend(onSend);
      }
      return;
    }

    if (!sendKey) return;
    e.preventDefault();
    if (slashOn && slashHits[0]) {
      const name = value.split(/\s/)[0];
      const exact = slashHits.find((c) => c.name === name);
      const cmd = exact ?? slashHits[0];
      runSlash(cmd, exact ? value.slice(name.length).trimStart() : "");
      return;
    }
    dispatchSend(onSend);
  }

  async function selectMention(hit: MentionHit) {
    const pick = beginMentionPick({ generation: mentionGenerationRef.current, value });
    mentionGenerationRef.current = pick.generation;
    mentionVisibleRef.current = pick.visible;
    setMentionOn(false);

    let content: string | undefined;
    if (includeContent && canAttachMentionContent(hit)) {
      const path = mentionPath(hit);
      try {
        content = readFile
          ? await readFile(path)
          : (await readTextFile(resolveMentionReadPath(cwd, path), cwd || null)).text;
      } catch {
        content = undefined;
      }
    }

    const next = applyMentionPickIfCurrent({
      pick,
      currentGeneration: mentionGenerationRef.current,
      hit,
      includeContent,
      content,
    });
    if (next == null) return;
    onChange(next);
    taRef.current?.focus();
  }

  const sendKbd = enterSends ? "↩" : "⌘↩";
  const altKbd = enterSends ? "⌘↩" : "↩";
  const idleSendTitle = `发送（${sendKbd}）`;
  const busySendTitle = altLabel === "改向" ? `排队发送（${sendKbd}）` : `立即改向（${sendKbd}）`;
  const busyAltTitle =
    altLabel === "改向"
      ? `改向（${altKbd}）`
      : altLabel
        ? `排队（${altKbd}）`
        : undefined;

  const canSend = (!!value.trim() || attachments.length > 0) && !blocked;

  return (
    <div
      ref={wrapRef}
      className={`composer-wrap${fileDragOver ? " file-drag-over" : ""}${takeover !== "bar" ? " composer-takeover" : ""}`}
      style={{ ["--thread" as string]: threadWidth }}
      onDragEnter={onFileDragEnter}
      onDragLeave={onFileDragLeave}
      onDragOver={onFileDragOver}
      onDrop={(e) => void onFileDrop(e)}
    >
      {children}

      {modeArmed ? (
        <div className="permission" role="alertdialog" aria-label="确认始终批准">
          <h4>始终批准</h4>
          <p className="permission-hint">会跳过本轮许可卡。危险命令仍可能被 hooks / 沙箱拦住。</p>
          <div className="set-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const next = modeArmed;
                setModeArmed(null);
                onMode(next);
              }}
            >
              继续
            </button>
            <button type="button" className="btn ghost" onClick={() => setModeArmed(null)}>
              取消
            </button>
          </div>
        </div>
      ) : null}

      {fileDragOver && (
        <div className="drop-overlay" aria-hidden>
          松开以添加文件
        </div>
      )}

      <QueueStrip
        queue={queue}
        onRemove={onRemoveQueued}
        onReorder={onReorderQueued}
        onEdit={onEditQueued}
      />

      <SlashMenu open={slashOn} items={slashHits} active={0} onPick={runSlash} />

      <MentionMenu
        open={mentionOn}
        items={mentions}
        active={mentionActive}
        onPick={(hit) => void selectMention(hit)}
        onHover={setMentionActive}
        includeContent={includeContent}
        onIncludeContent={setIncludeContent}
      />

      {takeover === "bar" ? (
      <div className="composer">
        <AttachStrip items={attachments} onRemove={removeAttachment} cwd={cwd} />
        <textarea
          ref={taRef}
          value={value}
          placeholder={busy ? "排队下一条…" : placeholder}
          aria-label="输入提示词"
          onChange={(e) => void handleChange(e.target.value)}
          onKeyDown={onKeyDown}
          onCompositionStart={() => {
            imeRef.current = applyImeComposition(imeRef.current, "start", Date.now());
          }}
          onCompositionEnd={() => {
            imeRef.current = applyImeComposition(imeRef.current, "end", Date.now());
          }}
        />
        <div className="composer-foot">
          <div className="left">
            <button
              type="button"
              className="plus-btn"
              onClick={openSlashPalette}
              title="命令（/）"
              aria-label="命令（/）"
            >
              <IconGrokPlus size={18} />
            </button>
            {onManageSkills ? (
              <button
                type="button"
                className="btn ghost manage-skills"
                onClick={onManageSkills}
              >
                管理技能
              </button>
            ) : null}
          </div>
          <div className="right">
            <div className="composer-chips">
            <AgentChip hasOpenSession={hasOpenSession} value={selectedAgentId} onChange={onSelectedAgent} />
            <ComposerChips
              mode={mode}
              onMode={(next) => {
                setModeOpen(false);
                onMode(next);
              }}
              modeOpen={modeOpen}
              onToggleMode={() => {
                setEffortOpen(false);
                setModelOpen(false);
                setWsOpen(false);
                setModeOpen((o) => !o);
              }}
              onArmMode={(next) => {
                setModeOpen(false);
                setModeArmed(next);
              }}
              effort={effort}
              onEffort={(next) => {
                setEffortOpen(false);
                onEffort(next);
              }}
              effortReady={effortReady}
              effortOpen={effortOpen}
              onToggleEffort={() => {
                if (!effortReady) return;
                setModeOpen(false);
                setModelOpen(false);
                setWsOpen(false);
                setEffortOpen((o) => !o);
              }}
              model={model}
              sessionModel={sessionModel}
              modelOptions={modelOptions}
              modelOpen={modelOpen}
              onToggleModel={() => {
                setModeOpen(false);
                setEffortOpen(false);
                setWsOpen(false);
                setModelOpen((o) => !o);
              }}
              onPickModel={(m) => {
                setModelOpen(false);
                (onSessionModel ?? onModel)(m);
              }}
              onOpenSettings={() => {
                setModelOpen(false);
                onOpenSettings();
              }}
            />
            </div>

            {busy && onAlt && altLabel && (
              <button
                type="button"
                className="alt-send"
                disabled={!canSend}
                title={
                  busyAltTitle ??
                  (altLabel === "改向"
                    ? "把这条注入正在跑的这一轮，不打断已完成的工具调用"
                    : "排到这一轮结束后再发")
                }
                onClick={() => dispatchSend(onAlt)}
              >
                {altLabel}
              </button>
            )}
            <button
              type="button"
              className="send-btn"
              disabled={!canSend}
              title={busy ? busySendTitle : idleSendTitle}
              aria-label={busy ? busySendTitle : idleSendTitle}
              onClick={() => dispatchSend(onSend)}
            >
              <IconUp />
            </button>
          </div>
        </div>
      </div>
      ) : null}
      {workspaceOptions || metaActions || footer ? (
        <div className="composer-meta-row">
          <div className="composer-meta-left">
            {workspaceOptions ? (
              <div className="chip-wrap">
                <button
                  type="button"
                  className="cwd-chip"
                  aria-haspopup="listbox"
                  aria-expanded={wsOpen}
                  title={workspaceLabel || undefined}
                  onClick={() => {
                    setModeOpen(false);
                    setEffortOpen(false);
                    setModelOpen(false);
                    setWsOpen((o) => !o);
                  }}
                >
                  <span className="cwd-chip-label">{workspaceLabel}</span>
                  <IconChevron size={12} />
                </button>
                {wsOpen ? (
                  <div className="chip-menu" role="listbox">
                    {workspaceOptions.map((o) => (
                      <button
                        key={o.path}
                        type="button"
                        onClick={() => {
                          onWorkspace?.(o.path);
                          setWsOpen(false);
                        }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="composer-meta-right">
            {metaActions}
            {footer}
          </div>
        </div>
      ) : null}
      {busy && busyHint ? (
        <p className="composer-busy-hint" role="status">{busyHint}</p>
      ) : null}
    </div>
  );
});
