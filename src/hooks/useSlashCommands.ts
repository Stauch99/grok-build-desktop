import { useRef } from "react";
import { listAgentsDir, listImagineArtifacts, type CliSettings } from "../api";
import { patchAgentModelSettings } from "../lib/workbench-api";
import type { AgentId } from "../lib/agent-id";
import type { AgentModelRow } from "../lib/agent-models";
import { snapModelChange } from "../lib/agent-models";
import type { CommandDef, HubTab } from "../lib/commands";
import { parseRenameArgs } from "../lib/commands";
import type { Mode } from "../lib/mode";
import { modeLabel, slashForMode } from "../lib/mode";
import { formatSessionInfo, exportTranscript, lastAssistantText } from "../lib/session-local";
import { setTitleOverride } from "../lib/projects";
import type { ChatState } from "../lib/chat";
import type { SessionSummary } from "../api";
import type { ExtraPage } from "../components/ExtraOverlay";
import type { ComposerHandle } from "../components/Composer";
import type { WebuiState } from "../api";
import type { ExtraPaneState } from "./useAcpSession";
import { MAIN_PANE } from "../lib/pane-tree";

export type SplitSlashAction = "mode-plan" | "mode-yolo" | "mode-agent" | "main-only" | "prompt";

/** Split pane only runs mode switches locally; other local commands belong on the left. */
export function splitSlashAction(local: CommandDef["local"] | undefined): SplitSlashAction {
  if (local === "plan") return "mode-plan";
  if (local === "yolo") return "mode-yolo";
  if (local === "auto") return "mode-agent";
  if (local) return "main-only";
  return "prompt";
}

export type SlashCommandDeps = {
  cwd: string;
  inboxCwd: string;
  model: string;
  effort: string;
  sessionModel: string | null;
  titles: Record<string, string>;
  chat: ChatState;
  sessions: SessionSummary[];
  sessionId: string | null;
  extraPanes: Record<string, { sessionId: string; busy: boolean; draft: string }>;
  mainPaneBusy: boolean;
  loadingSession: boolean;
  readyRef: React.MutableRefObject<boolean>;
  sessionIdRef: React.MutableRefObject<string | null>;
  currentTitleRef: React.MutableRefObject<string>;
  composerRef: React.MutableRefObject<ComposerHandle | null>;
  extraComposerRefs: React.MutableRefObject<Record<string, ComposerHandle | null>>;
  rewindLastEdit: number;
  cli: CliSettings | null;
  selectedAgentId: AgentId;
  modelRows: AgentModelRow[];
  persist: (partial: WebuiState) => void;
  showToast: (msg: string) => void;
  setMode: (mode: Mode) => void;
  setModel: (model: string) => void;
  setEffort: (effort: string) => void;
  setCli: React.Dispatch<React.SetStateAction<CliSettings | null>>;
  setBusy: (value: boolean) => void;
  setExtraPanes: React.Dispatch<React.SetStateAction<Record<string, ExtraPaneState>>>;
  setDraft: (value: string) => void;
  setExtraPage: (page: ExtraPage | null) => void;
  setImagineImages: (paths: string[]) => void;
  setImagineVideos: (paths: string[]) => void;
  setAgentRows: (rows: { name: string; path: string; kind: "agent" | "persona" }[]) => void;
  setTitles: (titles: Record<string, string>) => void;
  setRewindTarget: (index: number | null) => void;
  sendSlashToAgent: (text: string, dest?: string) => Promise<void>;
  sendPrompt: (text: string, dest?: string) => Promise<void>;
  startSession: () => Promise<void>;
  openSettings: () => void;
  openHub: (tab?: HubTab) => void;
  removeSession: (s: SessionSummary) => Promise<void>;
  restoreGenerated: (id: string) => void;
  beginEditTitle: () => void;
  onDreamNow: () => void;
};

export type SlashCommands = {
  runSlash: (cmd: CommandDef, rest?: string, dest?: string) => Promise<void>;
  applyMode: (next: Mode, dest?: string) => Promise<void>;
  applyModel: (next: string) => void;
  applySessionModel: (next: string) => void;
  applyEffort: (next: string) => void;
};

export function useSlashCommands(deps: SlashCommandDeps): SlashCommands {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  async function applyMode(next: Mode, dest: string = MAIN_PANE) {
    const d = depsRef.current;
    d.setMode(next);
    d.persist({ mode: next });
    const extra = dest !== MAIN_PANE;
    const paneBusy = extra ? !!d.extraPanes[dest]?.busy : d.mainPaneBusy;
    const live = extra
      ? !!(d.extraPanes[dest]?.sessionId && d.readyRef.current)
      : !!(d.sessionIdRef.current && d.readyRef.current && !d.loadingSession);
    if (live && paneBusy) {
      d.showToast("将在下一轮生效");
      return;
    }
    if (live) {
      try {
        await d.sendSlashToAgent(slashForMode(next), dest);
      } catch (e) {
        if (extra) {
          d.setExtraPanes((prev) => {
            const cur = prev[dest];
            if (!cur) return prev;
            return { ...prev, [dest]: { ...cur, busy: false } };
          });
        } else d.setBusy(false);
        d.showToast(String(e));
      }
      return;
    }
    d.showToast(`已记下 ${modeLabel(next)}，下一轮会话生效`);
  }

  function applyModel(next: string) {
    const d = depsRef.current;
    const snapped = snapModelChange(d.modelRows, next, d.effort);
    d.setModel(snapped.model);
    if (snapped.effort) d.setEffort(snapped.effort);
    const patch = snapped.effort ? { model: snapped.model, effort: snapped.effort } : { model: snapped.model };
    void patchAgentModelSettings(d.selectedAgentId, patch)
      .then(() => {
        if (d.selectedAgentId === "grok") {
          d.setCli((prev) => (prev ? { ...prev, model: snapped.model, effort: snapped.effort || prev.effort } : prev));
        }
        if (d.sessionModel && d.sessionModel !== snapped.model) {
          d.showToast(`已写入默认模型，当前会话仍是 ${d.sessionModel}。用 /model 可切换本会话。`);
        }
      })
      .catch((e) => d.showToast(String(e)));
  }

  function applySessionModel(next: string) {
    const d = depsRef.current;
    if (d.sessionIdRef.current && d.readyRef.current) {
      void d.sendPrompt(`/model ${next}`);
      d.showToast(`已发送 /model ${next}`);
      return;
    }
    applyModel(next);
  }

  function applyEffort(next: string) {
    const d = depsRef.current;
    d.setEffort(next);
    void patchAgentModelSettings(d.selectedAgentId, { effort: next })
      .then(() => {
        if (d.selectedAgentId === "grok") {
          d.setCli((prev) => (prev ? { ...prev, effort: next } : prev));
        }
      })
      .catch((e) => d.showToast(String(e)));
    if (d.selectedAgentId === "claude" && d.sessionIdRef.current && d.readyRef.current) {
      void d.sendPrompt(`/effort ${next}`);
    }
  }

  async function runSlash(cmd: CommandDef, rest = "", dest: string = MAIN_PANE) {
    const d = depsRef.current;
    if (dest !== MAIN_PANE) {
      const action = splitSlashAction(cmd.local);
      if (action === "mode-plan" || action === "mode-yolo" || action === "mode-agent") {
        d.setExtraPanes((prev) => {
          const cur = prev[dest];
          if (!cur) return prev;
          return { ...prev, [dest]: { ...cur, draft: "" } };
        });
        const mode: Mode = action === "mode-plan" ? "plan" : action === "mode-yolo" ? "yolo" : "agent";
        return applyMode(mode, dest);
      }
      if (action === "main-only") {
        d.showToast("这条命令请在左侧会话执行");
        return;
      }
      d.extraComposerRefs.current[dest]?.setText(cmd.name + " ");
      return;
    }
    if (cmd.local === "new") return d.startSession();
    if (cmd.local === "settings") return d.openSettings();
    if (cmd.local === "hub") {
      d.setDraft("");
      return d.openHub(cmd.hubTab ?? "skills");
    }
    if (cmd.local === "session-info") {
      d.setDraft("");
      const text = formatSessionInfo({
        id: d.sessionIdRef.current || "—",
        cwd: d.cwd || d.inboxCwd,
        model: d.sessionModel ?? d.model,
        title: d.currentTitleRef.current,
        turns: d.chat.items.filter((i) => i.kind === "user").length,
        usage: d.chat.usage,
      });
      void navigator.clipboard.writeText(text).then(() => d.showToast("已复制会话信息"));
      return;
    }
    if (cmd.local === "export") {
      d.setDraft("");
      const text = exportTranscript(d.chat.items);
      if (!text.trim()) {
        d.showToast("还没有可复制的对话");
        return;
      }
      void navigator.clipboard.writeText(text).then(() => d.showToast("已复制全部对话"));
      return;
    }
    if (cmd.local === "copy") {
      d.setDraft("");
      const text = lastAssistantText(d.chat.items);
      if (!text) {
        d.showToast("还没有可复制的回复");
        return;
      }
      void navigator.clipboard.writeText(text).then(() => d.showToast("已复制上一条回复"));
      return;
    }
    if (cmd.local === "fork") {
      d.setDraft("");
      return void d.sendPrompt("/fork");
    }
    if (cmd.local === "rewind") {
      d.setDraft("");
      if (d.rewindLastEdit >= 0) {
        d.setRewindTarget(d.rewindLastEdit);
        d.showToast("文件还原用「回到这里」；对话回退请确认对话框。也可发 /rewind");
        return;
      }
      return void d.sendPrompt("/rewind");
    }
    if (cmd.local === "dashboard") {
      d.setDraft("");
      d.setExtraPage("dashboard");
      return;
    }
    if (cmd.local === "imagine" || cmd.local === "imagine-video") {
      d.setDraft("");
      d.setExtraPage(cmd.local);
      void listImagineArtifacts(d.cwd || null).then((paths) => {
        d.setImagineImages(paths.filter((p) => !/\.(mp4|webm)$/i.test(p)));
        d.setImagineVideos(paths.filter((p) => /\.(mp4|webm)$/i.test(p)));
      }).catch(() => {});
      return;
    }
    if (cmd.local === "agents") {
      d.setDraft("");
      d.setExtraPage("agents");
      void listAgentsDir().then(d.setAgentRows).catch(() => {});
      return;
    }
    if (cmd.local === "memory") {
      d.setDraft("");
      d.setExtraPage("memory");
      return;
    }
    if (cmd.local === "dream") {
      d.setDraft("");
      d.onDreamNow?.();
      return;
    }
    if (cmd.local === "plan") {
      d.setDraft("");
      return applyMode("plan");
    }
    if (cmd.local === "yolo") {
      d.setDraft("");
      return applyMode("yolo");
    }
    if (cmd.local === "auto") {
      d.setDraft("");
      return applyMode("agent");
    }
    if (cmd.local === "delete" && d.sessionId) {
      const s = d.sessions.find((x) => x.id === d.sessionId);
      if (s) return d.removeSession(s);
    }
    if (cmd.local === "rename") {
      d.setDraft("");
      const parsed = parseRenameArgs(rest);
      if (parsed.kind === "error") {
        d.showToast(parsed.message);
        return;
      }
      const id = d.sessionIdRef.current;
      if (!id) {
        d.showToast("没有可重命名的会话");
        return;
      }
      if (parsed.kind === "auto") {
        d.restoreGenerated(id);
        return;
      }
      if (parsed.kind === "title") {
        const next = setTitleOverride(d.titles, id, parsed.title);
        d.setTitles(next);
        d.persist({ titles: next });
        return;
      }
      d.beginEditTitle();
      return;
    }
    d.composerRef.current?.setText(cmd.name + " ");
  }

  return { runSlash, applyMode, applyModel, applySessionModel, applyEffort };
}
