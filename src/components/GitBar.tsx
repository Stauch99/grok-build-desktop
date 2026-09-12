import { useEffect, useRef, useState, type ReactNode } from "react";
import { gitCommit, gitRemoteAdd, type GitStatus } from "../api";
import { branchMismatchToast, commitMessageOk } from "../lib/git-commit";
import {
  branchLabel,
  gitCommandError,
  gitPullEnabled,
  gitPushEnabled,
  gitRemoteUrlOk,
  gitSyncKind,
  isCheckoutableBranch,
  localGitBranches,
  type GitWorktree,
} from "../lib/git";
import { IconGrokPlus } from "../grok-icons";
import { IconBranch, IconCheck, IconChevron, IconGitFork } from "../icons";
import { basename } from "../lib/text";
import { sameCwd } from "../lib/inbox";
import { useT, useLocale } from "../lib/locale-context";
import { friendlyError } from "../lib/error-copy";
import { t as tx } from "../lib/i18n";

export type GitChipProps = {
  status: GitStatus;
  onClick?: () => void;
};

/** Compact branch + dirty count. Header uses this to open the Git pane. */
export function GitChip({ status, onClick }: GitChipProps) {
  const t = useT();
  if (!status.isRepo) return null;
  const label = branchLabel(status);
  const inner = (
    <span className="git-chip-inner">
      <IconBranch size={13} />
      <span className="git-branch">{label}</span>
      {status.dirty > 0 && <span className="git-dirty">{status.dirty}</span>}
    </span>
  );
  if (!onClick) {
    return <span className="git-chip">{inner}</span>;
  }
  return (
    <button type="button" className="git-chip" onClick={onClick} aria-label={t("git.open")}>
      {inner}
    </button>
  );
}

type GitMenuItem = { id: string; label: string; hint?: string; current?: boolean };

function GitActionMenu({
  title,
  disabled,
  items,
  onPick,
  footer,
  children,
}: {
  title: string;
  disabled?: boolean;
  items: GitMenuItem[];
  onPick: (id: string) => void;
  footer?: { label: string; onClick: () => void };
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="chip-wrap" ref={wrapRef}>
      <button
        type="button"
        className="git-chip"
        disabled={disabled}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="git-chip-inner">
          {children}
          <IconChevron size={11} />
        </span>
      </button>
      {open ? (
        <div className="chip-menu git-action-menu menu-hint-menu" role="menu">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={item.current}
              onClick={() => {
                setOpen(false);
                if (!item.current) onPick(item.id);
              }}
            >
              <span className="menu-hint-label">{item.label}</span>
              {item.hint ? <span className="menu-hint-text">{item.hint}</span> : null}
              <span className="menu-hint-check" aria-hidden>
                {item.current ? <IconCheck size={12} /> : null}
              </span>
            </button>
          ))}
          {footer ? (
            <>
              <div className="sep" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  footer.onClick();
                }}
              >
                <IconGrokPlus size={14} />
                {footer.label}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export type GitBarProps = {
  status: GitStatus | null;
  /** Opens the Git pane. Omit when the bar already lives there. */
  onOpenChanges?: () => void;
  onNewWorktree: () => void;
  busy?: boolean;
  sessionBranch?: string | null;
  onCommitted?: () => void;
  onToast?: (msg: string) => void;
  onPull?: () => void | Promise<string | null | void>;
  onPush?: () => void | Promise<string | null | void>;
  branches?: string[];
  worktrees?: GitWorktree[];
  cwd?: string;
  onCheckout?: (branch: string) => void;
  onSwitchWorktree?: (path: string) => void;
};

/**
 * Version-control actions for the Git pane: branch, commit, pull/push, worktree.
 */
export function GitBar({
  status,
  onOpenChanges,
  onNewWorktree,
  busy,
  sessionBranch,
  onCommitted,
  onToast,
  onPull,
  onPush,
  branches = [],
  worktrees = [],
  cwd,
  onCheckout,
  onSwitchWorktree,
}: GitBarProps) {
  const t = useT();
  const locale = useLocale();
  const [message, setMessage] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [committing, setCommitting] = useState(false);
  const [addingRemote, setAddingRemote] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const toasted = useRef("");

  useEffect(() => {
    const next = status?.branch ?? "";
    const msg = branchMismatchToast(sessionBranch, next);
    const key = `${sessionBranch ?? ""}|${next}`;
    const copy = tx(locale, "git.branchMismatch");
    if (msg && toasted.current !== key) {
      toasted.current = key;
      setHint(copy);
      onToast?.(copy);
    } else if (!msg) {
      toasted.current = key;
      setHint((prev) => (prev === copy ? null : prev));
    }
  }, [sessionBranch, status?.branch, onToast, locale]);

  if (!status?.isRepo) return null;
  const blocked = !!busy || committing || addingRemote;
  const canCommit = commitMessageOk(message) && !blocked;
  const kind = gitSyncKind(status);
  const pullOk = gitPullEnabled(status, blocked);
  const pushOk = gitPushEnabled(status, blocked);
  const canAddRemote = kind === "add-remote" && gitRemoteUrlOk(remoteUrl) && !blocked;
  const local = localGitBranches(branches).filter(isCheckoutableBranch);
  const branchOptions =
    status.branch && !local.includes(status.branch) && isCheckoutableBranch(status.branch)
      ? [status.branch, ...local]
      : local;
  const currentPath = cwd || status.root;

  const submit = async () => {
    if (!canCommit) return;
    setCommitting(true);
    setHint(null);
    try {
      const res = await gitCommit(status.root, message);
      if (res.ok) {
        setMessage("");
        onCommitted?.();
      } else {
        const err = res.stderr.trim() || t("git.commitFail");
        setHint(err);
        onToast?.(err);
      }
    } catch (e) {
      const err = friendlyError(e);
      setHint(err);
      onToast?.(err);
    } finally {
      setCommitting(false);
    }
  };

  const submitRemote = async () => {
    if (!canAddRemote) return;
    setAddingRemote(true);
    setHint(null);
    try {
      const res = await gitRemoteAdd(status.root, remoteUrl);
      if (res.ok) {
        setRemoteUrl("");
        onCommitted?.();
      } else {
        const err = gitCommandError(res, t("git.remoteFail")) ?? t("git.remoteFail");
        setHint(err);
        onToast?.(err);
      }
    } catch (e) {
      const err = friendlyError(e);
      setHint(err);
      onToast?.(err);
    } finally {
      setAddingRemote(false);
    }
  };

  const runRemote = (fn?: () => void | Promise<string | null | void>) => {
    setHint(null);
    void Promise.resolve(fn?.()).then((err) => {
      if (typeof err === "string" && err) setHint(err);
    });
  };

  const branchTrigger = (
    <>
      <IconBranch size={13} />
      <span className="git-branch">{branchLabel(status)}</span>
      {status.dirty > 0 && <span className="git-dirty">{status.dirty}</span>}
    </>
  );

  return (
    <div className="git-bar">
      {onCheckout && branchOptions.length > 0 ? (
        <GitActionMenu
          title={t("git.checkout")}
          disabled={blocked}
          items={branchOptions.map((b) => ({ id: b, label: b, current: b === status.branch }))}
          onPick={onCheckout}
        >
          {branchTrigger}
        </GitActionMenu>
      ) : (
        <GitChip status={status} onClick={onOpenChanges} />
      )}
      <input
        className="git-msg"
        value={message}
        placeholder={t("git.commitMsg")}
        aria-label={t("git.commitMsg")}
        disabled={blocked}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <button
        type="button"
        className="git-chip"
        disabled={!canCommit}
        onClick={() => void submit()}
      >
        <span className="git-chip-inner">{t("git.commit")}</span>
      </button>
      {kind === "add-remote" ? (
        <>
          <input
            className="git-msg"
            value={remoteUrl}
            placeholder={t("git.remoteUrl")}
            aria-label={t("git.remoteUrl")}
            disabled={blocked}
            onChange={(e) => setRemoteUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitRemote();
              }
            }}
          />
          <button
            type="button"
            className="git-chip"
            disabled={!canAddRemote}
            onClick={() => void submitRemote()}
          >
            <span className="git-chip-inner">{t("git.addRemote")}</span>
          </button>
        </>
      ) : (
        <>
          {onPull ? (
            <button
              type="button"
              className="git-chip"
              disabled={!pullOk}
              onClick={() => runRemote(onPull)}
            >
              <span className="git-chip-inner">
                {t("git.pull")}{status.behind > 0 ? ` ↓${status.behind}` : ""}
              </span>
            </button>
          ) : null}
          {onPush ? (
            <button
              type="button"
              className="git-chip"
              disabled={!pushOk}
              onClick={() => runRemote(onPush)}
            >
              <span className="git-chip-inner">
                {kind === "publish" ? t("git.publish") : t("git.push")}
                {kind === "sync" && status.ahead > 0 ? ` ↑${status.ahead}` : ""}
              </span>
            </button>
          ) : null}
        </>
      )}
      {onSwitchWorktree ? (
        <GitActionMenu
          title={t("git.worktrees")}
          disabled={blocked}
          items={worktrees.map((wt) => ({
            id: wt.path,
            label: basename(wt.path) || wt.path,
            hint: wt.branch,
            current: sameCwd(wt.path, currentPath),
          }))}
          onPick={onSwitchWorktree}
          footer={{ label: t("git.newWorktree"), onClick: onNewWorktree }}
        >
          <IconGitFork size={13} />
          <span className="git-worktree-label">
            {basename(currentPath) || t("git.worktreeLabel")}
          </span>
        </GitActionMenu>
      ) : (
        <button
          type="button"
          className="git-chip ghost"
          onClick={onNewWorktree}
          disabled={blocked}
        >
          <span className="git-chip-inner">
            <IconGrokPlus size={14} />
            <span className="git-worktree-label">{t("git.worktreeLabel")}</span>
          </span>
        </button>
      )}
      {hint || kind === "add-remote" ? (
        <span className="preview-note" role="status">
          {hint || t("git.noRemote")}
        </span>
      ) : null}
    </div>
  );
}
