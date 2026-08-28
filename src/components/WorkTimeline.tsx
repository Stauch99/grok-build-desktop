import { useState, type ReactNode } from "react";
import { openPath } from "../api";
import { formatElapsed, type WorkItem } from "../lib/chat";
import { thoughtLineLabel } from "../lib/time";
import { classifyTool, toolLineCopy } from "../lib/tool-render";
import {
  IconEdit,
  IconFileSearch,
  IconFileTxt,
  IconFolder,
  IconLight,
  IconSearch,
  IconTerminal,
} from "../icons";
import { DotMatrix } from "./DotMatrix";
import { ToolResult } from "./ToolResult";

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
  onActivate,
  label,
  children,
  body,
}: {
  icon: ReactNode;
  expandable: boolean;
  failed?: boolean;
  onActivate?: () => void;
  label: string;
  children: ReactNode;
  body?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const canOpen = expandable && body != null;
  const interactive = canOpen || !!onActivate;
  const activate = () => {
    if (canOpen) setOpen((v) => !v);
    else onActivate?.();
  };
  return (
    <div className={`spine-row${open ? " open" : ""}${failed ? " failed" : ""}`}>
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
  );
}

export function WorkLiveRow({
  startedAt,
  onStop,
}: {
  startedAt?: number;
  onStop: () => void;
}) {
  const label =
    startedAt != null ? `工作了 ${formatElapsed(Date.now() - startedAt)}` : "工作中";
  return (
    <button
      type="button"
      className="work-live"
      aria-label={`停止 · ${label}`}
      title="停止"
      onClick={onStop}
    >
      <span className="spine-ico" aria-hidden>
        <DotMatrix />
      </span>
      <span className="spine-head static">
        <span className="spine-verb">{label}</span>
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
}: {
  items: WorkItem[];
  busy?: boolean;
  cwd?: string;
  live?: ReactNode;
  onInspectTool?: (item: Extract<WorkItem, { kind: "tool" }>) => void;
}) {
  const last = items[items.length - 1];
  const openPathAbs = (p: string) => {
    const target = p.startsWith("/") ? p : cwd ? `${cwd.replace(/\/$/, "")}/${p}` : p;
    void openPath(target);
  };

  return (
    <div className="work-timeline">
      {items.map((item) => {
        if (item.kind === "thought") {
          const liveThought = busy && last?.id === item.id;
          const verb = thoughtLineLabel(item.at, item.until, liveThought);
          const text = item.text.trim();
          return (
            <SpineRow
              key={item.id}
              icon={<IconLight size={18} />}
              expandable={!!text}
              label={verb}
              body={text ? <div className="thought">{item.text}</div> : null}
            >
              <span className="spine-verb">{verb}</span>
            </SpineRow>
          );
        }
        const { verb, detail } = toolLineCopy(item.title, item.toolKind);
        const kind = classifyTool(item.title, item.toolKind);
        const hasBody = !!(item.diff || item.detail);
        const label = detail ? `${verb} ${detail}` : verb;
        return (
          <SpineRow
            key={item.id}
            icon={<ToolIcon kind={kind} />}
            expandable={hasBody}
            failed={item.status === "failed" || item.status === "cancelled"}
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
                  />
              ) : null
            }
          >
            <span className="spine-verb">{verb}</span>
            {detail ? (
              <span className="spine-detail" title={detail}>
                {detail}
              </span>
            ) : null}
          </SpineRow>
        );
      })}
      {live}
    </div>
  );
}
