import { useEffect, useMemo, useRef } from "react";
import {
  gitChanges,
  gitStatus,
  listAgentsDir,
  listMemoryChanges,
  listWorkspaceEntries,
  notify,
  ensureNotifyPermission,
  onNotifyOpen,
  onWindowFocus,
  readManagedConfig,
  readPlan,
  listProjectRules,
  readUsageHistory,
  setBadge,
  setHideOnClose,
  setNotifyTarget,
  setWorkspace,
  windowFocused,
  type SessionSummary,
  type WebuiState,
} from "../api";
import { formatElapsed, type ChatItem } from "../lib/chat";
import { sessionTokensAfterLiveUsage } from "../lib/sidebar-list";
import { applyAccent } from "../lib/accent";
import { t, type Locale } from "../lib/i18n";
import { MAIN_PANE, leafIds } from "../lib/pane-tree";
import { paneTurnIsLive, runningSessionIds } from "../lib/acp-turn";
import { paneNeedsCloseConfirm } from "../lib/app-hotkeys";
import { tapDanger } from "../lib/confirm";
import { dequeue, putSessionQueue } from "../lib/prompt-queue";
import { isSessionFocused, notifyText, shouldMarkUnread, shouldNotify } from "../lib/notify";
import { countAttention } from "../lib/session-badge";
import { playTurnDone } from "../lib/sound";
import { persistReviewOpen } from "../lib/review-rail";
import { friendlyError } from "../lib/error-copy";
import { fitLayout } from "../lib/layout";
import { situationAutoCollapse } from "../lib/shell-ia";
import { shouldPollBilling } from "../lib/auth-kind";
import { billingKindFromDoctors } from "../lib/agent-port";
import { parseWeeklyUsage } from "../lib/weekly-usage";
import { activityKey } from "../lib/stall";
import { firstHitIndex } from "../lib/search-highlight";
import { detectMemoryUpdates, snapshotMtimes } from "../lib/memory-dock";
import { nextGoalView } from "../lib/goal-bar";
import { markUnread, clearUnread, pruneUnread } from "../lib/session-status";
import { BILLING_POLL_MS, scheduleIdle, shouldRunChipWarmup } from "../lib/agent-warmup";
import { shouldWarmupOnChipSelect } from "../lib/session-agent";
import type { CommandDef } from "../lib/commands";
import type { QueuedPermission } from "../lib/permission-queue";
import { useAppHotkeys } from "./useAppHotkeys";
import { useSessionHotkeys } from "./useSessionHotkeys";
import { hydrateWebuiState } from "./hydrate-webui";
import { ensureMemoryMcp } from "../lib/workbench-api";
import type { useAppModelState } from "./useAppModelState";
import type { useAppWorkspace } from "./useAppWorkspace";
import type { useAcpSession, ExtraPaneState } from "./useAcpSession";
import type { useAppModelView } from "./useAppModelView";
import type { ReviewController } from "./useReviewController";

type EffectsDeps = {
  s: ReturnType<typeof useAppModelState>;
  ws: ReturnType<typeof useAppWorkspace>;
  acp: ReturnType<typeof useAcpSession>;
  view: ReturnType<typeof useAppModelView>;
  review: ReviewController;
  persist: (partial: WebuiState) => void;
  showToast: (msg: string) => void;
  palette: { open: boolean; setOpen: (open: boolean | ((v: boolean) => boolean)) => void };
  extraBusy: boolean;
  mainPaneBusy: boolean;
  cancelPermission: (req: QueuedPermission) => Promise<void>;
  refreshInspect: (dir?: string) => Promise<void>;
  refreshGit: () => Promise<void>;
  sendPrompt: (text: string, dest?: string) => Promise<void>;
  doctorsReady: boolean;
  sendBlocked: boolean;
  runSlash: (cmd: CommandDef, rest?: string, dest?: string) => Promise<void>;
  locale: Locale;
  allSessions: SessionSummary[];
  reviewCwd: string;
  reviewSessionId: string | null;
  focusedExtra: ExtraPaneState | undefined;
};

export function useAppModelEffects(d: EffectsDeps) {
  const { s, ws, acp, view, review } = d;
  s.refreshSessionsRef.current = ws.refreshAllSessions;
  s.onAcpSessionListRef.current = ws.onAcpSessionList;
  s.onSessionCreatedRef.current = ws.onSessionCreated;
  s.runSlashRef.current = d.runSlash;
  s.reviewCloseRef.current = () => review.close();
  s.permissionCancelRef.current = async (target) => {
    const selected = view.panePermissions[target];
    if (selected) await d.cancelPermission(selected);
  };
  s.focusedSessionIdRef.current = view.focusedSessionId ?? null;

  useEffect(() => {
    if (
      !shouldRunChipWarmup({
        hasOpenSession: !!acp.sessionId,
        doctorsReady: d.doctorsReady,
        sendBlocked: d.sendBlocked,
        warmupEnabled: shouldWarmupOnChipSelect(),
      })
    ) {
      return;
    }
    void acp.ensureAgent(s.selectedAgentId).catch((e) => d.showToast(friendlyError(e)));
  }, [s.selectedAgentId, acp.sessionId, d.doctorsReady, d.sendBlocked]);

  useEffect(() => {
    if (!d.reviewSessionId) {
      s.setPlanFile(null);
      return;
    }
    let cancelled = false;
    void readPlan(d.reviewSessionId)
      .then((file) => {
        if (!cancelled) s.setPlanFile(file);
      })
      .catch(() => {
        if (!cancelled) s.setPlanFile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [d.reviewSessionId, d.focusedExtra?.chat.plan, acp.chat.plan, review.tab, review.open]);

  useEffect(() => {
    const reset = s.goalSessionRef.current !== acp.sessionId;
    s.goalSessionRef.current = acp.sessionId;
    s.setGoalView((prev) => nextGoalView(acp.chat.plan, reset ? null : prev, Date.now()));
  }, [acp.sessionId, acp.chat.plan]);

  useEffect(() => {
    if (!d.reviewCwd) {
      s.setRules([]);
      return;
    }
    let cancelled = false;
    void listProjectRules(d.reviewCwd)
      .then((rows) => {
        if (!cancelled) s.setRules(rows);
      })
      .catch(() => {
        if (!cancelled) s.setRules([]);
      });
    return () => {
      cancelled = true;
    };
  }, [d.reviewCwd, review.tab, review.open]);

  useEffect(() => {
    document.documentElement.dataset.theme = s.theme;
    document.documentElement.dataset.themeFamily = s.themeFamily;
    document.documentElement.dataset.density = s.density;
  }, [s.theme, s.themeFamily, s.density]);

  useEffect(() => {
    applyAccent(document.documentElement, s.accentId);
  }, [s.accentId]);

  useEffect(() => {
    void setHideOnClose(s.hideToTray).catch(() => {});
  }, [s.hideToTray]);

  useEffect(() => {
    void ensureNotifyPermission();
  }, []);

  useEffect(() => {
    let off: (() => void) | undefined;
    void onNotifyOpen((sid) => {
      void setNotifyTarget(null);
      const row = [...s.inboxSessions, ...s.sessions].find((x) => x.id === sid);
      if (row) void ws.openSession(row);
      window.setTimeout(() => {
        document.querySelector<HTMLElement>(".permission")?.focus();
      }, 200);
    }).then((fn) => {
      off = fn;
    });
    return () => off?.();
  }, [s.inboxSessions, s.sessions]);

  const extraCwdKey = Object.values(s.extraPanes).map((p) => p.cwd).join("|");
  useEffect(() => {
    const cwds = Object.entries(s.extraPanes).map(([id, pane]) => [id, pane.cwd] as const);
    if (!cwds.length) {
      s.setExtraMentionData({});
      return;
    }
    let cancelled = false;
    void Promise.all(
      cwds.map(async ([id, sc]) => {
        try {
          const [entries, cs] = await Promise.all([
            listWorkspaceEntries(sc),
            gitStatus(sc).then((status) => (status.isRepo ? gitChanges(sc) : [])).catch(() => []),
          ]);
          return [
            id,
            { cwd: sc, dirs: entries.filter((e) => e.kind === "dir").map((e) => e.name), changes: cs.map((c) => c.path) },
          ] as const;
        } catch {
          return [id, { cwd: sc, dirs: [], changes: [] }] as const;
        }
      }),
    ).then((rows) => {
      if (!cancelled) s.setExtraMentionData(Object.fromEntries(rows));
    });
    return () => {
      cancelled = true;
    };
  }, [extraCwdKey]);

  useEffect(() => {
    if (!s.cwd) {
      s.setWorkspaceEntries([]);
      return;
    }
    void listWorkspaceEntries(s.cwd).then(s.setWorkspaceEntries).catch(() => s.setWorkspaceEntries([]));
  }, [s.cwd]);

  useEffect(() => {
    if (!s.cwd) return;
    void setWorkspace(s.cwd, acp.sessionId).catch(() => {});
  }, [s.cwd, acp.sessionId]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const rows = await listMemoryChanges();
        if (cancelled) return;
        if (!s.memoryBaseline.current) {
          s.memoryBaseline.current = snapshotMtimes(rows);
          s.setMemoryChanges([]);
          return;
        }
        s.setMemoryChanges(detectMemoryUpdates(rows, s.memoryBaseline.current, Date.now()));
      } catch {
        /* ignore */
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!s.settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") s.setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s.settingsOpen]);

  useEffect(() => {
    if (!s.atBottom) return;
    s.chatEl.current?.scrollTo({ top: s.chatEl.current.scrollHeight });
  }, [acp.chat.items, d.mainPaneBusy, s.atBottom]);

  useEffect(() => {
    for (const [id, pane] of Object.entries(s.extraPanes)) {
      if (!pane.atBottom) continue;
      s.extraChatEls.current[id]?.scrollTo({ top: s.extraChatEls.current[id]!.scrollHeight });
    }
  }, [s.extraPanes]);

  useEffect(() => {
    const finishedId = acp.lastFinishedSessionRef.current;
    if (finishedId) {
      acp.lastFinishedSessionRef.current = null;
      const started = s.busyStartRef.current;
      const elapsedMs = started == null ? 0 : Date.now() - started;
      void d.refreshGit();
      const sessionFocused = isSessionFocused(s.focusedSessionIdRef.current, finishedId);
      const windowFocused = s.focusedRef.current;
      if (shouldMarkUnread(windowFocused, sessionFocused)) {
        s.setUnread((prev) => {
          const next = markUnread(prev, finishedId, "done");
          if (next !== prev) d.persist({ unread: next });
          return next;
        });
      }
      if (shouldNotify({ reason: "turn-done", windowFocused, sessionFocused, elapsedMs })) {
        if (s.soundsRef.current) playTurnDone();
        void setNotifyTarget(finishedId);
        const { title, body } = notifyText(
          "turn-done",
          s.titleForSessionRef.current(finishedId),
          formatElapsed(elapsedMs),
        );
        void notify(title, body);
      }
    }
    if (acp.busy) {
      if (s.busyStartRef.current === null) s.busyStartRef.current = Date.now();
      s.setMainBusyAt((t) => t ?? Date.now());
      return;
    }
    s.setMainBusyAt(null);
    if (runningSessionIds(acp.turnsRef.current).length === 0) s.busyStartRef.current = null;
  }, [acp.busy, acp.runningSessionId, acp.liveTurnIds, d.refreshGit]);

  useEffect(() => {
    const idle = Object.entries(s.extraPanes).filter(([, pane]) => !pane.busy);
    for (const [id, pane] of idle) {
      if (acp.pendingPrompt.current === id) continue;
      const started = s.extraBusyStartRef.current[id];
      delete s.extraBusyStartRef.current[id];
      if (started == null) continue;
      const elapsedMs = Date.now() - started;
      const sessionFocused = isSessionFocused(s.focusedSessionIdRef.current, pane.sessionId);
      const windowFocused = s.focusedRef.current;
      if (pane.sessionId && shouldMarkUnread(windowFocused, sessionFocused)) {
        const sid = pane.sessionId;
        s.setUnread((prev) => {
          const next = markUnread(prev, sid, "done");
          if (next !== prev) d.persist({ unread: next });
          return next;
        });
      }
      if (shouldNotify({ reason: "turn-done", windowFocused, sessionFocused, elapsedMs })) {
        if (s.soundsRef.current) playTurnDone();
        if (pane.sessionId) void setNotifyTarget(pane.sessionId);
        const { title, body } = notifyText(
          "turn-done",
          s.titleForSessionRef.current(pane.sessionId),
          formatElapsed(elapsedMs),
        );
        void notify(title, body);
      }
      const { next, rest } = dequeue(pane.queue);
      if (!next) continue;
      s.setExtraPanes((prev) => {
        const cur = prev[id];
        if (!cur) return prev;
        return { ...prev, [id]: { ...cur, queue: rest } };
      });
      void d.sendPrompt(next.text, id);
    }
    for (const [id, pane] of Object.entries(s.extraPanes)) {
      if (pane.busy && s.extraBusyStartRef.current[id] == null) s.extraBusyStartRef.current[id] = Date.now();
    }
  }, [s.extraPanes, d.sendPrompt]);

  useEffect(() => {
    if (!acp.busy && !d.extraBusy) return;
    const id = window.setInterval(() => s.setClock((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [acp.busy, d.extraBusy]);

  const activity = useMemo(() => {
    const last = acp.chat.items[acp.chat.items.length - 1];
    const lastLen = last && "text" in last ? last.text.length : 0;
    const tools = acp.chat.items
      .filter((i): i is Extract<ChatItem, { kind: "tool" }> => i.kind === "tool")
      .map((i) => i.status)
      .join(",");
    return activityKey(acp.chat.items.length, lastLen, tools);
  }, [acp.chat.items]);

  useEffect(() => {
    s.lastActivityRef.current = Date.now();
  }, [activity]);

  useEffect(() => {
    s.queueRef.current = s.queue;
    s.sessionQueuesRef.current = putSessionQueue(s.sessionQueuesRef.current, acp.sessionIdRef.current, s.queue);
  }, [s.queue]);

  useEffect(() => {
    s.focusedRef.current = s.focused;
  }, [s.focused]);

  useEffect(() => {
    const onResize = () => s.setWinWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const open = review.open;
    const fit = fitLayout(s.sidebarWidth, s.previewWidth, s.winWidth, open);
    if (fit.sidebar !== s.sidebarWidth) s.setSidebarWidth(fit.sidebar);
    if (fit.preview !== s.previewWidth) s.setPreviewWidth(fit.preview);
  }, [s.winWidth, review.open, s.sidebarWidth, s.previewWidth]);

  useEffect(() => {
    if (situationAutoCollapse(s.winWidth)) {
      review.close();
      d.persist(persistReviewOpen(false));
      s.setSidebarCollapsed(true);
    }
  }, [s.winWidth]);

  useEffect(() => {
    let off: (() => void) | null = null;
    void windowFocused().then(s.setFocused);
    void onWindowFocus((next) => {
      s.setFocused(next);
    }).then((fn) => {
      off = fn;
    });
    return () => off?.();
  }, []);

  useEffect(() => {
    if (!s.focused) return;
    const id = view.focusedSessionId;
    if (!id) return;
    s.setUnread((prev) => {
      const cleared = clearUnread(prev, id);
      if (cleared !== prev) d.persist({ unread: cleared });
      return cleared;
    });
  }, [s.focused, view.focusedSessionId]);

  useEffect(() => {
    if (!s.editingTitleId) return;
    s.titleInputRef.current?.focus();
    s.titleInputRef.current?.select();
  }, [s.editingTitleId]);

  useEffect(() => {
    if (!s.menu && !s.movePick) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (t instanceof Element && (t.closest(".menu") || t.closest("[data-menu-trigger]"))) return;
      s.setMenu(null);
      s.setMovePick(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        s.setMenu(null);
        s.setMovePick(null);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [s.menu, s.movePick]);

  useEffect(() => {
    void hydrateWebuiState({
      persist: d.persist,
      showToast: d.showToast,
      applySessionUnion: ws.applySessionUnion,
      refreshInspect: d.refreshInspect,
      hydrateReview: (value) => review.hydrateLegacy(value),
      agentPickedRef: s.agentPickedRef,
      selectedAgentIdLiveRef: s.selectedAgentIdLiveRef,
      setSelectedAgentId: s.setSelectedAgentId,
      setDoctors: s.setDoctors,
      setInfo: s.setInfo,
      setCli: s.setCli,
      setShowThinking: s.setShowThinking,
      setMode: s.setMode,
      setProjects: s.setProjects,
      setManualProjects: s.setManualProjects,
      setTheme: s.setTheme,
      setChatWidth: s.setChatWidth,
      setChatFontSize: s.setChatFontSize,
      setTitles: s.setTitles,
      setPinned: s.setPinned,
      setArchived: s.setArchived,
      setSessionDrafts: s.setSessionDrafts,
      setEnterSends: s.setEnterSends,
      setSounds: s.setSounds,
      setAllowedTools: s.setAllowedTools,
      setAutoArchiveDays: s.setAutoArchiveDays,
      setSteerByDefault: s.setSteerByDefault,
      setInjectUserMemory: s.setInjectUserMemory,
      setDreamingEnabled: s.setDreamingEnabled,
      setDreamAgentId: s.setDreamAgentId,
      setDreamThresholdSessions: s.setDreamThresholdSessions,
      setMemoryMcpEnabled: s.setMemoryMcpEnabled,
      setMemoryDisplayName: s.setMemoryDisplayName,
      setLocale: s.setLocale,
      setThemeFamily: s.setThemeFamily,
      setAccentId: s.setAccentId,
      setDensity: s.setDensity,
      setHideToTray: s.setHideToTray,
      setDefaultRail: s.setDefaultRail,
      setShortcuts: s.setShortcuts,
      setUnread: s.setUnread,
      setSidebarWidth: s.setSidebarWidth,
      setPreviewWidth: s.setPreviewWidth,
      setSidebarList: s.setSidebarList,
      setLastWorkspace: s.setLastWorkspace,
      setPinnedProjects: s.setPinnedProjects,
      setProjectGroups: s.setProjectGroups,
      setInboxCwd: s.setInboxCwd,
      setSessionTokens: s.setSessionTokens,
      setCwd: s.setCwd,
      setSettingsHydrated: s.setSettingsHydrated,
    });
  }, []);

  useEffect(() => {
    if (!s.settingsHydrated) return;
    void ensureMemoryMcp(s.memoryMcpEnabled).catch(() => undefined);
  }, [s.settingsHydrated, s.memoryMcpEnabled]);

  const billingInflight = useRef(false);
  const refreshBillingRef = useRef<() => Promise<void>>(async () => {});
  refreshBillingRef.current = async () => {
    if (!acp.readyRef.current || billingInflight.current) return;
    const kind = billingKindFromDoctors(s.doctorsRef.current ?? [], "grok");
    if (!shouldPollBilling(kind)) return;
    billingInflight.current = true;
    try {
      const raw = await acp.rpc("_x.ai/billing", {}, { timeoutMs: 8000 });
      s.setWeeklyUsage(parseWeeklyUsage(raw));
    } catch {
      /* keep the last snapshot; billing is best-effort */
    } finally {
      billingInflight.current = false;
    }
  };

  useEffect(() => {
    if (!acp.ready) return;
    void refreshBillingRef.current();
    const id = window.setInterval(() => void refreshBillingRef.current(), BILLING_POLL_MS);
    return () => window.clearInterval(id);
  }, [acp.ready]);

  useEffect(() => {
    if (!acp.ready || !s.focused) return;
    void refreshBillingRef.current();
  }, [acp.ready, s.focused]);

  useEffect(() => {
    if (!acp.ready) return;
    if (s.extraPage !== "usage" && !s.settingsOpen) return;
    void refreshBillingRef.current();
  }, [acp.ready, s.extraPage, s.settingsOpen]);

  useEffect(() => {
    return scheduleIdle(() => {
      void readUsageHistory().then(s.setUsageHistory).catch(() => {});
      void readManagedConfig().then(s.setManaged).catch(() => {});
      void listAgentsDir().then(s.setAgentRows).catch(() => {});
    });
  }, []);

  useEffect(() => {
    if (s.extraPage === "usage" || s.settingsOpen) {
      void readUsageHistory().then(s.setUsageHistory).catch(() => {});
    }
    if (s.extraPage === "agents") {
      void listAgentsDir().then(s.setAgentRows).catch(() => {});
    }
    if (s.settingsOpen) {
      void readManagedConfig().then(s.setManaged).catch(() => {});
    }
  }, [s.extraPage, s.settingsOpen]);

  const usage = acp.chat.usage;
  useEffect(() => {
    if (!usage?.used || !usage.size) return;
    s.setUsageHistory((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.used === usage.used && last.size === usage.size) return prev;
      return [...prev.slice(-48), { at: Date.now(), used: usage.used ?? 0, size: usage.size ?? 0 }];
    });
  }, [usage?.used, usage?.size]);

  useEffect(() => {
    const next = sessionTokensAfterLiveUsage(s.sessionTokens, acp.sessionId, usage?.used);
    if (!next) return;
    s.setSessionTokens(next);
    d.persist({ sessionTokens: next });
  }, [acp.sessionId, usage?.used, s.sessionTokens, d.persist]);

  useEffect(() => {
    s.currentTitleRef.current = view.currentTitle;
  }, [view.currentTitle]);

  useEffect(() => {
    void setBadge(countAttention(d.allSessions.map((row) => view.statusFor(row.id))));
  }, [d.allSessions, view.statusFor]);

  useAppHotkeys({
    shortcuts: s.shortcuts,
    overlayOpen:
      s.settingsOpen ||
      s.hubOpen ||
      d.palette.open ||
      s.millerOpen ||
      !!s.appConfirm ||
      !!s.menu ||
      s.extraPage != null ||
      s.rewindTarget != null,
    canClosePane: leafIds(s.paneTree).length > 1,
    allowCancel:
      s.focusedPaneId === MAIN_PANE
        ? acp.busy
        : paneTurnIsLive(acp.turnsRef.current, {
            pane: s.focusedPaneId,
            sessionId: s.extraPanes[s.focusedPaneId]?.sessionId ?? null,
          }),
    telemetry: !!s.cli?.telemetry,
    handlers: {
      palette: () => d.palette.setOpen(true),
      "new-chat": () => void ws.newChatInFocus(),
      settings: () => s.setSettingsOpen(true),
      hub: () => {
        s.setHubTab("skills");
        s.setHubOpen(true);
        s.setSettingsOpen(false);
      },
      "focus-composer": () => s.composerRef.current?.focus(),
      review: () => {
        const next = !review.open;
        review.toggle(s.defaultRail);
        d.persist(persistReviewOpen(next));
      },
      "close-pane": () => {
        const paneId = s.focusedPaneIdRef.current;
        const extra = s.extraPanesRef.current[paneId];
        const paneBusy =
          paneId === MAIN_PANE
            ? acp.busy
            : paneTurnIsLive(acp.turnsRef.current, {
                pane: paneId,
                sessionId: extra?.sessionId ?? null,
              });
        const paneDraft = paneId === MAIN_PANE ? s.draft : extra?.draft ?? "";
        if (paneNeedsCloseConfirm({ busy: paneBusy, draft: paneDraft })) {
          s.setAppConfirm({
            kind: "close-pane",
            paneId,
            title: t(d.locale, "hotkey.closePaneTitle"),
            body: t(d.locale, "hotkey.closePaneBody"),
            confirmLabel: t(d.locale, "pane.close"),
          });
          return;
        }
        ws.closePaneLeaf(paneId);
      },
      cancel: () => {
        const paneId = s.focusedPaneIdRef.current;
        const extra = s.extraPanesRef.current[paneId];
        const paneBusy =
          paneId === MAIN_PANE
            ? acp.busy
            : paneTurnIsLive(acp.turnsRef.current, {
                pane: paneId,
                sessionId: extra?.sessionId ?? null,
              });
        const dest = paneId === MAIN_PANE ? MAIN_PANE : paneId;
        if (!paneBusy) return;
        const tapped = tapDanger(s.cancelArmRef.current, "cancel-turn", Date.now());
        s.cancelArmRef.current = tapped.next;
        if (!tapped.confirmed) {
          d.showToast(t(d.locale, "hotkey.cancelAgain"));
          return;
        }
        void acp.cancelTurn(dest);
      },
    },
  });

  useSessionHotkeys({
    enabled: !s.settingsOpen && !s.menu && !d.palette.open,
    sessionIds: view.visibleHotkeySessions,
    onOpenIndex: (i) => {
      const id = view.visibleHotkeySessions[i];
      if (!id) return;
      const row = ws.findSessionById(id);
      if (row) void ws.openSession(row);
    },
    onMru: () => s.setMruOpen((v) => !v),
  });

  useEffect(() => {
    if (d.allSessions.length === 0) return;
    s.setUnread((prev) => {
      const next = pruneUnread(prev, d.allSessions.map((row) => row.id));
      if (Object.keys(next).length === Object.keys(prev).length) return prev;
      d.persist({ unread: next });
      return next;
    });
  }, [d.allSessions, d.persist]);

  useEffect(() => {
    if (!s.searchJump) return;
    const rows = acp.chat.items
      .filter((i): i is Extract<ChatItem, { kind: "user" | "assistant" }> => i.kind === "user" || i.kind === "assistant")
      .map((i) => ({ id: i.id, text: i.text }));
    const hit = firstHitIndex(rows, s.searchJump);
    if (hit) s.setJumpTurnId(hit);
  }, [acp.chat.items, s.searchJump]);

  useEffect(() => {
    if (view.reconciledReviewTab !== review.tab) review.setTab(view.reconciledReviewTab);
  }, [view.reconciledReviewTab, review.tab]);
}
