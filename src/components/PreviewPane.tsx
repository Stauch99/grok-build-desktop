import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { assetRoots, safeFileSrc } from "../lib/asset-src";
import { highlight, highlightLang, tokensToLines, type HighlightToken } from "../lib/highlight";
import {
  afterPreviewSave,
  imageTransform,
  lineGutter,
  panImage,
  previewErrorCopy,
  previewKind,
  putPreviewCache,
  relativeTo,
  removePreviewTab,
  upsertPreviewTab,
  zoomByWheel,
  type PreviewCacheEntry,
  type PreviewTab,
  activeTabAfterClose,
} from "../lib/preview";
import { findNext, findPrev, previewFind, type PreviewFindState } from "../lib/preview-find";
import { basename } from "../lib/text";
import { IconGrokClose } from "../grok-icons";
import { IconCode, IconCopy, IconEdit, IconFinder, IconMarkdown, IconSave, IconSearch } from "../icons";
import { Markdown } from "./Markdown";
import { HtmlArtifactPreview } from "./HtmlArtifactPreview";
import { PreviewTabs } from "./PreviewTabs";

export type PreviewPaneProps = {
  path: string | null;
  text: string | null;
  truncated?: boolean;
  error?: string | null;
  /** Root used to shorten the path in the header. */
  cwd?: string;
  dark: boolean;
  width?: number;
  embedded?: boolean;
  tabs?: PreviewTab[];
  onSelectTab?: (path: string) => void;
  onCloseTab?: (path: string) => void;
  onClose?: () => void;
  onReveal?: (path: string) => void;
  /** A local path clicked inside a rendered markdown preview. */
  onFollowLink?: (e: ReactMouseEvent) => void;
  onSave?: (path: string, text: string) => void | Promise<void>;
  onSaved?: (ok: boolean) => void;
  onGitRefresh?: () => void;
};

/**
 * Right-hand file preview. Markdown renders by default — that is the common
 * case for agent output (READMEs, plans, notes) and reading raw markdown
 * source defeats the point of previewing it. Source stays one click away.
 */
export function PreviewPane({
  path,
  text,
  truncated,
  error,
  cwd,
  dark,
  width,
  embedded = false,
  tabs: tabsProp,
  onSelectTab,
  onCloseTab,
  onClose,
  onReveal,
  onFollowLink,
  onSave,
  onSaved,
  onGitRefresh,
}: PreviewPaneProps) {
  const rootRef = useRef<HTMLElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef(new Map<string, PreviewCacheEntry>());
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [raw, setRaw] = useState(false);
  const [draft, setDraft] = useState(text ?? "");
  const [editing, setEditing] = useState(false);
  const [ownTabs, setOwnTabs] = useState<PreviewTab[]>([]);
  const [ownActive, setOwnActive] = useState<string | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [find, setFind] = useState<PreviewFindState>(() => previewFind("", ""));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!path) return;
    setOwnTabs((tabs) => upsertPreviewTab(tabs, path));
    setOwnActive(path);
    if (text != null) putPreviewCache(cacheRef.current, path, text);
  }, [path, text]);

  const tabs = tabsProp ?? ownTabs;
  const displayPath = (tabsProp ? path : ownActive) || path;
  const cached = displayPath && displayPath !== path ? cacheRef.current.get(displayPath)?.text : undefined;
  const displayText = cached ?? text;

  useEffect(() => {
    setRaw(false);
    setEditing(false);
    setDraft(displayText ?? "");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [displayPath, displayText]);

  useEffect(() => {
    if (!findOpen) return;
    setFind((prev) => previewFind(displayText ?? "", prev.query));
  }, [displayPath, displayText, findOpen]);

  useEffect(() => {
    if (findOpen) findRef.current?.focus();
  }, [findOpen]);

  useEffect(() => {
    if (!findOpen || find.index < 0) return;
    rootRef.current?.querySelector(".preview-find-hit.current")?.scrollIntoView({ block: "nearest" });
  }, [find.index, findOpen, displayPath]);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFind(previewFind(displayText ?? "", ""));
  }, [displayText]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inPane = !!rootRef.current?.contains(document.activeElement) || !!rootRef.current?.contains(e.target as Node);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f" && inPane) {
        e.preventDefault();
        setFindOpen(true);
        return;
      }
      if (e.key === "Escape") {
        if (findOpen) {
          e.preventDefault();
          closeFind();
          return;
        }
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeFind, findOpen, onClose]);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => zoomByWheel(z, e.deltaY));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [displayPath]);

  const selectTab = (next: string) => {
    if (onSelectTab) onSelectTab(next);
    else setOwnActive(next);
  };

  const closeTab = (closed: string) => {
    if (onCloseTab) {
      onCloseTab(closed);
      return;
    }
    const next = activeTabAfterClose(ownTabs, closed, displayPath);
    setOwnTabs((tabs) => removePreviewTab(tabs, closed));
    cacheRef.current.delete(closed);
    if (next) setOwnActive(next);
    else onClose?.();
  };

  const saveDraft = async () => {
    if (!onSave || !displayPath) return;
    try {
      await onSave(displayPath, draft);
      onSaved?.(true);
      afterPreviewSave(true, onGitRefresh);
      setEditing(false);
    } catch {
      onSaved?.(false);
      afterPreviewSave(false, onGitRefresh);
    }
  };

  if (!displayPath) return null;

  const kind = previewKind(displayPath);
  const media = kind === "image" || kind === "video";
  const mediaSrc = media ? safeFileSrc(displayPath, assetRoots(cwd ?? "", ""), convertFileSrc) : null;
  const label = cwd ? relativeTo(displayPath, cwd) : basename(displayPath);
  const loading = !media && displayText === null && !error;
  const source = kind === "code" || raw || (kind === "html" && raw) || (kind === "markdown" && raw);

  return (
    <aside
      ref={rootRef}
      className={`preview-pane${embedded ? " embedded" : ""}`}
      style={width ? { width, flexBasis: width } : undefined}
      aria-label={`预览 ${basename(displayPath)}`}
      tabIndex={-1}
    >
      <PreviewTabs tabs={tabs} active={displayPath} onSelect={selectTab} onClose={closeTab} />
      <header>
        <span className="preview-name" title={displayPath}>
          {label}
        </span>
        <span className="preview-actions">
          {kind === "markdown" && displayText !== null && !media ? (
            <button
              type="button"
              className="file-open"
              aria-pressed={raw}
              title={raw ? "渲染" : "源码"}
              aria-label={raw ? "渲染" : "源码"}
              onClick={() => setRaw((v) => !v)}
            >
              {raw ? <IconMarkdown size={14} /> : <IconCode size={14} />}
            </button>
          ) : null}
          {displayText !== null && !media ? (
            <button
              type="button"
              className="file-open"
              aria-pressed={findOpen}
              title="查找"
              aria-label="查找"
              onClick={() => setFindOpen((v) => !v)}
            >
              <IconSearch size={14} />
            </button>
          ) : null}
          {displayText !== null && !media ? (
            <button
              type="button"
              className="file-open"
              title="复制全文"
              aria-label="复制全文"
              onClick={() => void navigator.clipboard.writeText(displayText)}
            >
              <IconCopy size={14} />
            </button>
          ) : null}
          {displayText !== null && onSave && !media ? (
            <button
              type="button"
              className="file-open"
              aria-pressed={editing}
              title={editing ? "保存" : "编辑"}
              aria-label={editing ? "保存" : "编辑"}
              onClick={() => {
                if (editing) void saveDraft();
                else setEditing(true);
              }}
            >
              {editing ? <IconSave size={14} /> : <IconEdit size={14} />}
            </button>
          ) : null}
          {onReveal ? (
            <button
              type="button"
              className="file-open"
              title="在访达中打开"
              aria-label="在访达中打开"
              onClick={() => onReveal(displayPath)}
            >
              <IconFinder size={14} />
            </button>
          ) : null}
          {onClose ? (
            <button type="button" className="icon-btn" aria-label="关闭预览" title="关闭预览" onClick={onClose}>
              <IconGrokClose size={16} />
            </button>
          ) : null}
        </span>
      </header>

      {findOpen && !media ? (
        <div className="preview-find">
          <input
            ref={findRef}
            type="search"
            value={find.query}
            placeholder="在文件中查找"
            aria-label="查找"
            onChange={(e) => setFind(previewFind(displayText ?? "", e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setFind((s) => (e.shiftKey ? findPrev(s) : findNext(s)));
              }
            }}
          />
          <span className="preview-find-count">
            {find.matches.length === 0 ? "无匹配" : `${find.index + 1}/${find.matches.length}`}
          </span>
        </div>
      ) : null}

      {truncated && !media && displayPath === path ? <p className="preview-note">文件较大，仅显示前 256KB</p> : null}

      {media ? (
        <div
          ref={mediaRef}
          className={`preview-body preview-media preview-media-pan${dragging ? " dragging" : ""}`}
          onPointerDown={(e) => {
            if (kind !== "image") return;
            dragRef.current = { x: e.clientX, y: e.clientY };
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!dragRef.current) return;
            const dx = e.clientX - dragRef.current.x;
            const dy = e.clientY - dragRef.current.y;
            dragRef.current = { x: e.clientX, y: e.clientY };
            setPan((p) => panImage(p, dx, dy));
          }}
          onPointerUp={() => {
            dragRef.current = null;
            setDragging(false);
          }}
        >
          {mediaSrc ? (
            kind === "video" ? (
              <video src={mediaSrc} controls preload="metadata" playsInline />
            ) : (
              <img
                src={mediaSrc}
                alt={basename(displayPath)}
                style={{ transform: imageTransform({ zoom, x: pan.x, y: pan.y }) }}
                draggable={false}
              />
            )
          ) : (
            <p className="preview-empty">无法预览，请用访达打开</p>
          )}
        </div>
      ) : loading ? (
        <div className="preview-loading">
          <div className="spinner" />
        </div>
      ) : displayText === null ? (
        <p className="preview-empty">{error ? previewErrorCopy(error) : "无法预览，请用访达打开"}</p>
      ) : editing ? (
        <textarea
          className="preview-body preview-code"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="编辑文件"
        />
      ) : kind === "html" && !raw ? (
        <div className="preview-body html-frame">
          <HtmlArtifactPreview html={displayText} title={`沙盒预览 ${basename(displayPath)}`} />
        </div>
      ) : kind === "markdown" && !raw ? (
        <div className="preview-body md-scroll">
          <Markdown text={displayText} dark={dark} cwd={cwd} onClick={onFollowLink} />
        </div>
      ) : source ? (
        <HighlightedSource text={displayText} path={displayPath} find={find} />
      ) : (
        <pre className="preview-body preview-code">{displayText}</pre>
      )}
    </aside>
  );
}

function HighlightedSource({ text, path, find }: { text: string; path: string; find: PreviewFindState }) {
  const lang = highlightLang(path);
  const lines = useMemo(() => {
    const tokens = lang ? highlight(text, lang) : [{ text, kind: "plain" as const }];
    return tokensToLines(tokens);
  }, [lang, text]);
  const numbers = lineGutter(text);
  let offset = 0;
  return (
    <pre className="preview-body preview-code preview-source">
      {numbers.map((n, i) => {
        const lineTokens = lines[i] ?? [];
        const start = offset;
        const lineText = lineTokens.map((t) => t.text).join("");
        offset += lineText.length + (i < numbers.length - 1 ? 1 : 0);
        return (
          <div key={n} className="preview-line">
            <span className="preview-gutter">{n}</span>
            <span className="preview-line-code">{paintLine(lineTokens, start, find)}</span>
          </div>
        );
      })}
    </pre>
  );
}

function paintLine(tokens: HighlightToken[], lineStart: number, find: PreviewFindState) {
  const nodes: ReactNode[] = [];
  let pos = lineStart;
  let key = 0;
  for (const tok of tokens) {
    let t = 0;
    while (t < tok.text.length) {
      const abs = pos + t;
      const match = find.matches.find((m) => abs >= m.start && abs < m.end);
      if (!match) {
        const next = find.matches.find((m) => m.start > abs);
        const take = next ? Math.min(tok.text.length - t, next.start - abs) : tok.text.length - t;
        nodes.push(
          <span key={key++} className={`preview-hl-${tok.kind}`}>
            {tok.text.slice(t, t + take)}
          </span>,
        );
        t += take;
      } else {
        const take = Math.min(tok.text.length - t, match.end - abs);
        const current = find.index >= 0 && find.matches[find.index] === match;
        nodes.push(
          <mark key={key++} className={current ? "preview-find-hit current" : "preview-find-hit"}>
            {tok.text.slice(t, t + take)}
          </mark>,
        );
        t += take;
      }
    }
    pos += tok.text.length;
  }
  return nodes;
}
