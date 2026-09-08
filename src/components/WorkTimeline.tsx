import { useEffect, useState, type ReactNode } from "react";
import { openPath } from "../api";
import type { WorkItem } from "../lib/chat";
import { thoughtLineLabel } from "../lib/time";
import { classifyTool, compressLabel, compressTimeline, toolLineCopy } from "../lib/tool-render";
import { formatWorkedElapsed, liveTool } from "../lib/work-run";
import {
  IconEdit,
  IconFileSearch,
  IconFileTxt,
  IconFolder,
  IconLight,
  IconSearch,
  IconSpark,
  IconTerminal,
} from "../icons";
import { ToolResult } from "./ToolResult";
import { useT } from "../lib/locale-context";
import { useBriefMotion } from "../lib/motion";

function ToolIcon({ kind }: { kind: ReturnType<typeof classifyTool> }) {
  const size = 18;
  if (kind === "bash") return <IconTerminal size={size} />;
  if (kind === "read") return <IconFileSearch size={size} />;
  if (kind === "edit") return <IconEdit size={size} />;
  if (kind === "search") return <IconSearch size={size} />;
  if (kind === "write") return <IconFileTxt size={size} />;
  return <IconFolder size={size} />;
}

function SpineRow({
  icon,
  expandable,
  failed,
  live,
  onActivate,
  label,
  children,
  body,
}: {
  icon: ReactNode;
  expandable: boolean;
  failed?: boolean;
  live?: boolean;
  onActivate?: () => void;
  label: string;
  children: ReactNode;
  body?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const tick = useBriefMotion(label);
  const canOpen = expandable && body != null;
  const interactive = canOpen || !!onActivate;
  const activate = () => {
    if (canOpen) setOpen((v) => !v);
    else onActivate?.();
  };
  return (
    <div className="spine-slot">
      <div className={`spine-row${open ? " open" : ""}${failed ? " failed" : ""}${live ? " live" : ""}${tick ? " tick" : ""}`}>
        <span className="spine-ico">{icon}</span>
        {interactive ? (
          <button
            type="button"
            className="spine-head"
            aria-expanded={canOpen ? open : undefined}
            aria-label={label}
            onClick={activate}
          >
            {children}
          </button>
        ) : (
          <div className="spine-head static">{children}</div>
        )}
        {open && body ? <div className="spine-body">{body}</div> : null}
      </div>
    </div>
  );
}

export function WorkLiveRow({
  startedAt,
  onStop,
}: {
  startedAt?: number;
  onStop: () => void;
}) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const label =
    startedAt != null
      ? t("timeline.worked", { elapsed: formatWorkedElapsed(now - startedAt) })
      : t("timeline.working");
  return (
    <button
      type="button"
      className="work-live"
      aria-label={t("timeline.stopAria", { label })}
      data-tip={t("thread.stop")}
      onClick={onStop}
    >
      <span className="spine-ico" aria-hidden>
        <IconSpark size={18} />
      </span>
      <span className="spine-head static">
        <span className="spine-verb shimmer-text">{label}</span>
      </span>
    </button>
  );
}

export function WorkTimeline({
  items,
  busy = false,
  cwd = "",
  live,
  onInspectTool,
  onRetry,
  onDraft,
}: {
  items: WorkItem[];
  busy?: boolean;
  cwd?: string;
  live?: ReactNode;
  onInspectTool?: (item: Extract<WorkItem, { kind: "tool" }>) => void;
  onRetry?: (item: Extract<WorkItem, { kind: "tool" }>) => void;
  onDraft?: (item: Extract<WorkItem, { kind: "tool" }>) => void;
}) {
  const last = items[items.length - 1];
  const currentTool = busy ? liveTool(items) : undefined;
  const openPathAbs = (p: string) => {
    const target = p.startsWith("/") ? p : cwd ? `${cwd.replace(/\/$/, "")}/${p}` : p;
    void openPath(target);
  };

  const toolRow = (item: Extract<WorkItem, { kind: "tool" }>) => {
    const { verb, detail } = toolLineCopy(item.title, item.toolKind);
    const kind = classifyTool(item.title, item.toolKind);
    const hasBody = !!(item.diff || item.detail);
    const label = detail ? `${verb} ${detail}` : verb;
    const live = currentTool?.id === item.id;
    return (
      <SpineRow
        key={item.id}
        icon={<ToolIcon kind={kind} />}
        expandable={hasBody}
        failed={item.status === "failed" || item.status === "cancelled"}
        live={live}
        onActivate={!hasBody && onInspectTool ? () => onInspectTool(item) : undefined}
        label={label}
        body={
          hasBody ? (
            <ToolResult
              title={item.title}
              toolKind={item.toolKind}
              status={item.status}
              detail={item.detail}
              diff={item.diff}
              onOpenPath={openPathAbs}
              onRetry={
                item.status === "failed" && onRetry ? () => onRetry(item) : undefined
              }
              onDraft={
                item.status === "failed" && onDraft ? () => onDraft(item) : undefined
              }
            />
          ) : null
        }
      >
        <span className="spine-verb">{verb}</span>
        {detail ? (
          <span className="spine-detail" data-tip={detail}>
            {detail}
          </span>
        ) : null}
      </SpineRow>
    );
  };

  return (
    <div className="work-timeline">
      {compressTimeline(items).map((row) => {
        if (row.kind === "item") {
          const item = row.item;
          if (item.kind === "thought") {
            const liveThought = busy && !currentTool && last?.id === item.id;
            const verb = thoughtLineLabel(item.at, item.until, liveThought);
            const text = item.text.trim();
            return (
              <SpineRow
                key={item.id}
                icon={<IconLight size={18} />}
                expandable={!!text}
                live={liveThought}
                label={verb}
                body={text ? <div className="thought">{item.text}</div> : null}
              >
                <span className="spine-verb">{verb}</span>
              </SpineRow>
            );
          }
          return toolRow(item);
        }
        const label = compressLabel(row.cls, row.items.length);
        const failed = row.items.some((t) => t.status === "failed" || t.status === "cancelled");
        const liveGroup = !!currentTool && row.items.some((t) => t.id === currentTool.id);
        return (
          <SpineRow
            key={row.items[0].id}
            icon={<ToolIcon kind={row.cls === "call" ? "other" : row.cls} />}
            expandable
            failed={failed}
            live={liveGroup}
            label={label}
            body={
              <div className="spine-group">
                {row.items.map((item) => {
                  const { detail, verb } = toolLineCopy(item.title, item.toolKind);
                  const line = detail || verb;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="spine-sub"
                      data-tip={line}
                      onClick={() => onInspectTool?.(item)}
                    >
                      <span className="spine-detail">{line}</span>
                    </button>
                  );
                })}
              </div>
            }
          >
            <span className="spine-verb">{label}</span>
          </SpineRow>
        );
      })}
      {live}
    </div>
  );
}
