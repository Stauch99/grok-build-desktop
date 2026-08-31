import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { AgentChip } from "./AgentChip";
import { AttachStrip } from "./AttachStrip";
import { ComposerChips } from "./ComposerChips";
import type { AgentId } from "../lib/agent-id";
import { MentionMenu } from "./MentionMenu";
import { QueueStrip } from "./QueueStrip";
import { SlashMenu } from "./SlashMenu";
import { IconChevron, IconUp } from "../icons";
import { useShortcutState } from "./ShortcutHint";
import {
  addAttachments,
  ATTACHMENT_CAP,
  clipboardAttachHits,
  formatAttachmentsPrompt,
  isFileDrag,
  pasteFileExt,
  pathsFromTauriDrop,
  rejectAttachment,
  resolveAttachPath,
  type Attachment,
  type ClipboardAttachHit,
} from "../lib/attachments";
import { dropPointHitsZone } from "../lib/drop-hit";
import { readTextFile, importDroppedFile, savePasteBytes, statAttachment } from "../api";
import { filterCommands, type CommandDef } from "../lib/commands";
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
import { useT } from "../lib/locale-context";
import {
  applyImeComposition,
  emptyImeEnterState,
  imeBlocksEnter,
} from "../lib/ime-enter";
import {
  composerMetaHide,
  sameMetaHide,
  type ComposerMetaHide,
} from "../lib/composer-meta";

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
  /** CSS measure for the column. Fill is 100% of this pane, including split. */
  threadWidth: string;

  commands: SlashCommand[];
  onRunSlash: (cmd: CommandDef, rest: string) => void;

  cwd: string;
  grokHome?: string;
  listFiles: (query: string) => Promise<string[]>;
  /** Optional file reader for “附带内容”. Falls back to `readTextFile`. */
  readFile?: (path: string) => Promise<string>;
  /** Relative folder paths offered in @-mentions. */
  mentionDirs?: string[];
  /** Git working-tree relative paths for @-mentions and "本次改动". */
  mentionChanges?: string[];

  mode: Mode;
  onMode: (next: Mode) => void;

  effort: string;
  onEffort: (next: string) => void;
  /** When false, effort chip is hidden or inert. */
  effortReady?: boolean;
  effortOptions?: string[];

  model: string;
  /** Model this session actually runs on, when it differs from the default. */
  sessionModel?: string | null;
  modelOptions: string[];
  modelLabels?: Record<string, string>;
  onModel: (next: string) => void;
  onOpenSettings: () => void;
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
  el.style.height = "0";
  el.style.height = `${Math.min(Math.max(el.scrollHeight, 24), max)}px`;
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
    threadWidth,
    commands,
    onRunSlash,
    cwd,
    grokHome = "",
    listFiles,
    readFile,
    mentionDirs,
    mentionChanges,
    mode,
    onMode,
    effort,
    onEffort,
    effortReady = true,
    effortOptions = [],
    model,
    sessionModel,
    modelOptions,
    modelLabels,
    onModel,
    onOpenSettings,
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
  const { held, mac } = useShortcutState();
  const t = useT();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileDragDepthRef = useRef(0);
  const html5DropRef = useRef(false);
  const mentionGenerationRef = useRef(0);
  const mentionQueryRef = useRef("");
  const mentionVisibleRef = useRef(false);
  const mentionOwnerRef = useRef(cwd);
  const mentionEffectOwnerRef = useRef(cwd);
  const imeRef = useRef(emptyImeEnterState());
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
  const [agentOpen, setAgentOpen] = useState(false);
  const [modeArmed, setModeArmed] = useState<Mode | null>(null);
  const [effortOpen, setEffortOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const metaRowRef = useRef<HTMLDivElement>(null);
  const [metaHide, setMetaHide] = useState<ComposerMetaHide>({
    cwd: false,
    stats: false,
    ring: false,
  });

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
    async (paths: { path: string; kind: "file" | "dir"; bytes?: number; name?: string }[]) => {
      const incoming: Attachment[] = [];
      for (const p of paths) {
        const result = await resolveAttachPath(
          p,
          (path) => statAttachment(path, cwd || null),
          (path) => importDroppedFile(path),
        );
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

  const ingestClipboardHits = useCallback(
    async (hits: ClipboardAttachHit[]) => {
      const incoming: { path: string; kind: "file" | "dir"; bytes?: number; name?: string }[] = [];
      for (const hit of hits) {
        if (hit.kind === "path") {
          incoming.push({ path: hit.path, kind: hit.fileKind, bytes: hit.bytes });
          continue;
        }
        const name = hit.file.name.trim() || "image.png";
        const reason = rejectAttachment({ name, bytes: hit.file.size });
        if (reason) {
          onOverflow?.(reason);
          continue;
        }
        try {
          const buf = new Uint8Array(await hit.file.arrayBuffer());
          const saved = await savePasteBytes(Array.from(buf), pasteFileExt(name, hit.file.type), name);
          incoming.push({ path: saved.path, kind: "file", bytes: saved.bytes, name: saved.name || name });
        } catch (err) {
          const text = err instanceof Error && err.message.trim() ? err.message : "无法保存粘贴的附件";
          onOverflow?.(text);
        }
      }
      await ingestPaths(incoming);
    },
    [ingestPaths, onOverflow],
  );

  const dropZoneEl = useCallback((): Element | null => {
    const wrap = wrapRef.current;
    if (!wrap) return null;
    return wrap.closest(".work-col") ?? wrap.closest(".pane") ?? wrap;
  }, []);

  const pointInWrap = useCallback(
    (x: number, y: number) => {
      const zone = dropZoneEl();
      if (!zone) return false;
      return dropPointHitsZone(x, y, zone.getBoundingClientRect(), window.devicePixelRatio || 1);
    },
    [dropZoneEl],
  );

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const { payload } = event;

        if (payload.type === "enter" || payload.type === "over") {
          setFileDragOver(pointInWrap(payload.position.x, payload.position.y));
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

        if (!pointInWrap(payload.position.x, payload.position.y)) return;

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
    const zone = dropZoneEl();
    if (!zone) return;

    const onEnter = (e: Event) => {
      const ev = e as DragEvent;
      if (!isFileDrag(ev.dataTransfer)) return;
      ev.preventDefault();
      fileDragDepthRef.current += 1;
      setFileDragOver(true);
    };
    const onLeave = (e: Event) => {
      e.preventDefault();
      fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1);
      if (fileDragDepthRef.current === 0) setFileDragOver(false);
    };
    const onOver = (e: Event) => {
      const ev = e as DragEvent;
      if (!isFileDrag(ev.dataTransfer)) return;
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
      setFileDragOver(true);
    };
    const onDrop = (e: Event) => {
      const ev = e as DragEvent;
      if (!isFileDrag(ev.dataTransfer)) return;
      ev.preventDefault();
      ev.stopPropagation();
      fileDragDepthRef.current = 0;
      setFileDragOver(false);
      html5DropRef.current = false;
      const hits = clipboardAttachHits(ev.dataTransfer);
      if (hits.length === 0) return;
      html5DropRef.current = true;
      void ingestClipboardHits(hits);
    };

    zone.addEventListener("dragenter", onEnter);
    zone.addEventListener("dragleave", onLeave);
    zone.addEventListener("dragover", onOver);
    zone.addEventListener("drop", onDrop);
    return () => {
      zone.removeEventListener("dragenter", onEnter);
      zone.removeEventListener("dragleave", onLeave);
      zone.removeEventListener("dragover", onOver);
      zone.removeEventListener("drop", onDrop);
    };
  }, [dropZoneEl, ingestClipboardHits]);

  useEffect(() => {
    if (!modeOpen && !effortOpen && !modelOpen && !wsOpen && !agentOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (t instanceof Element && t.closest(".chip-wrap")) return;
      setModeOpen(false);
      setEffortOpen(false);
      setModelOpen(false);
      setWsOpen(false);
      setAgentOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setModeOpen(false);
      setEffortOpen(false);
      setModelOpen(false);
      setWsOpen(false);
      setAgentOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [modeOpen, effortOpen, modelOpen, wsOpen, agentOpen]);

  useLayoutEffect(() => {
    const row = metaRowRef.current;
    if (!row) return;
    const apply = () => {
      const next = composerMetaHide({
        available: row.clientWidth,
        cwd: row.querySelector<HTMLElement>(".composer-meta-cwd")?.offsetWidth ?? 0,
        stats: row.querySelector<HTMLElement>(".composer-meta-stats")?.offsetWidth ?? 0,
        ring: row.querySelector<HTMLElement>(".usage-chip")?.offsetWidth ?? 0,
        keep:
          (row.querySelector<HTMLElement>(".composer-chips")?.offsetWidth ?? 0) +
          (row.querySelector<HTMLElement>(".fork-btn")?.offsetWidth ?? 0),
      });
      setMetaHide((prev) => (sameMetaHide(prev, next) ? prev : next));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(row);
    return () => ro.disconnect();
  }, [workspaceLabel, footer, metaActions, takeover]);

  useEffect(() => {
    if (metaHide.cwd) setWsOpen(false);
  }, [metaHide.cwd]);

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

  function onPasteFiles(e: ClipboardEvent<HTMLDivElement>) {
    const hits = clipboardAttachHits(e.clipboardData);
    if (hits.length === 0) return;
    e.preventDefault();
    void ingestClipboardHits(hits);
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

  const modGlyph = mac ? "⌘" : "Ctrl+";
  const sendKbd = enterSends ? "↩" : `${modGlyph}↩`;
  const altKbd = enterSends ? `${modGlyph}↩` : "↩";
  const idleSendTitle = t("composer.sendKbd", { k: sendKbd });
  const busySendTitle = altLabel === t("composer.steer")
    ? t("composer.queueSend", { k: sendKbd })
    : t("composer.steerNow", { k: sendKbd });
  const busyAltTitle =
    altLabel === t("composer.steer")
      ? t("composer.steerKbd", { k: altKbd })
      : altLabel
        ? t("composer.queueKbd", { k: altKbd })
        : undefined;

  const canSend = (!!value.trim() || attachments.length > 0) && !blocked;
  const overlayHost = fileDragOver ? dropZoneEl() : null;

  return (
    <div
      ref={wrapRef}
      className={`composer-wrap${fileDragOver ? " file-drag-over" : ""}${takeover !== "bar" ? " composer-takeover" : ""}`}
      style={{ ["--thread" as string]: threadWidth }}
      onPaste={onPasteFiles}
    >
      {children}

      {modeArmed ? (
        <div className="permission" role="alertdialog" aria-label={t("composer.confirmYolo")}>
          <h4>{t("composer.yolo")}</h4>
          <p className="permission-hint">{t("composer.yoloHint")}</p>
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
              {t("composer.continue")}
            </button>
            <button type="button" className="btn ghost" onClick={() => setModeArmed(null)}>
              {t("composer.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {overlayHost &&
        createPortal(
          <div className="drop-overlay" aria-hidden>
            {t("composer.drop")}
          </div>,
          overlayHost,
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
        <AttachStrip items={attachments} onRemove={removeAttachment} cwd={cwd} grokHome={grokHome} />
        <div className="composer-main">
          <textarea
            ref={taRef}
            rows={1}
            value={value}
            aria-label={t("composer.input")}
            onChange={(e) => void handleChange(e.target.value)}
            onKeyDown={onKeyDown}
            onCompositionStart={() => {
              imeRef.current = applyImeComposition(imeRef.current, "start", Date.now());
            }}
            onCompositionEnd={() => {
              imeRef.current = applyImeComposition(imeRef.current, "end", Date.now());
            }}
          />
          <div className="composer-actions">
            {busy && onAlt && altLabel && (
              <button
                type="button"
                className={`alt-send${held && enterSends ? " shortcut-host" : ""}`}
                disabled={!canSend}
                title={
                  busyAltTitle ??
                  (altLabel === t("composer.steer")
                    ? t("composer.steerHint")
                    : t("composer.queueHint"))
                }
                onClick={() => dispatchSend(onAlt)}
              >
                {altLabel}
                {held && enterSends ? <kbd className="shortcut-kbd">{altKbd}</kbd> : null}
              </button>
            )}
            <button
              type="button"
              className={`send-btn${held && !enterSends ? " shortcut-host" : ""}`}
              disabled={!canSend}
              title={busy ? busySendTitle : idleSendTitle}
              aria-label={busy ? busySendTitle : idleSendTitle}
              onClick={() => dispatchSend(onSend)}
            >
              <IconUp size={14} />
              {held && !enterSends ? <kbd className="shortcut-kbd">{sendKbd}</kbd> : null}
            </button>
          </div>
        </div>
      </div>
      ) : null}
      {workspaceOptions || metaActions || footer || takeover === "bar" ? (
        <div
          className="composer-meta-row"
          ref={metaRowRef}
          data-hide-cwd={metaHide.cwd ? "" : undefined}
          data-hide-stats={metaHide.stats ? "" : undefined}
          data-hide-ring={metaHide.ring ? "" : undefined}
        >
          <div className="composer-meta-left">
            {workspaceOptions ? (
              <div className="chip-wrap composer-meta-cwd">
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
                    setAgentOpen(false);
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
            {footer ? <div className="composer-meta-stats">{footer}</div> : null}
          </div>
          <div className="composer-meta-right">
            {takeover === "bar" ? (
              <div className="composer-chips">
                <AgentChip
                  hasOpenSession={hasOpenSession}
                  value={selectedAgentId}
                  onChange={(id) => {
                    setAgentOpen(false);
                    onSelectedAgent(id);
                  }}
                  open={agentOpen}
                  onToggle={() => {
                    setModeOpen(false);
                    setEffortOpen(false);
                    setModelOpen(false);
                    setWsOpen(false);
                    setAgentOpen((o) => !o);
                  }}
                />
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
                    setAgentOpen(false);
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
                  effortOptions={effortOptions}
                  effortOpen={effortOpen}
                  onToggleEffort={() => {
                    if (!effortReady) return;
                    setModeOpen(false);
                    setModelOpen(false);
                    setWsOpen(false);
                    setAgentOpen(false);
                    setEffortOpen((o) => !o);
                  }}
                  model={model}
                  sessionModel={sessionModel}
                  modelOptions={modelOptions}
                  modelLabels={modelLabels}
                  modelOpen={modelOpen}
                  onToggleModel={() => {
                    setModeOpen(false);
                    setEffortOpen(false);
                    setWsOpen(false);
                    setAgentOpen(false);
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
            ) : null}
            {metaActions}
          </div>
        </div>
      ) : null}
      {busy && busyHint ? (
        <p className="composer-busy-hint" role="status">{busyHint}</p>
      ) : null}
    </div>
  );
});
