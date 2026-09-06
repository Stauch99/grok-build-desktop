import { filterCommands, type HubTab } from "../lib/commands";
import { t, type Locale } from "../lib/i18n";
import { persistReviewOpen } from "../lib/review-rail";
import { exportTranscript } from "../lib/session-local";
import type { PaletteAction } from "../lib/palette";
import type { ChatState } from "../lib/chat";
import type { SessionSummary, WebuiState } from "../api";
import type { CommandDef } from "../lib/commands";
import type { ExtraPage } from "../components/ExtraOverlay";

export type PaletteActionDeps = {
  locale: Locale;
  theme: "light" | "dark";
  reviewOpen: boolean;
  defaultRail: "tasks" | "changes" | "context";
  cwd: string;
  chat: ChatState;
  allSessions: SessionSummary[];
  persist: (partial: WebuiState) => void;
  showToast: (msg: string) => void;
  setTheme: (theme: "light" | "dark") => void;
  setExtraPage: (page: ExtraPage | null) => void;
  setImagineImages: (paths: string[]) => void;
  setImagineVideos: (paths: string[]) => void;
  setAgentRows: (rows: { name: string; path: string; kind: "agent" | "persona" }[]) => void;
  composerSetText: (text: string) => void;
  openSession: (s: SessionSummary) => void | Promise<void>;
  selectProject: (path: string) => void | Promise<void>;
  runSlash: (cmd: CommandDef, rest?: string, dest?: string) => Promise<void>;
  newChatInFocus: () => Promise<void>;
  startSession: () => Promise<void>;
  openSettings: () => void;
  openHub: (tab?: HubTab) => void;
  sendPrompt: (text: string) => Promise<void>;
  toggleReview: (defaultTab?: "tasks" | "changes" | "context") => void;
  openReview: (action: "plan") => void;
  addProject: () => Promise<void>;
  newWorktreeSession: () => Promise<void>;
  openPath: (path: string) => Promise<void>;
  listImagineArtifacts: (cwd: string | null) => Promise<string[]>;
  listAgentsDir: () => Promise<{ name: string; path: string; kind: "agent" | "persona" }[]>;
};

export function handlePaletteAction(d: PaletteActionDeps, action: PaletteAction): void {
  if (action.kind === "session") {
    const s = d.allSessions.find((x) => x.id === action.id);
    if (s) void d.openSession(s);
    return;
  }
  if (action.kind === "project") {
    void d.selectProject(action.path);
    return;
  }
  if (action.kind === "slash") {
    const cmd = filterCommands(action.name, d.chat.commands).find((c) => c.name === action.name);
    if (cmd) void d.runSlash(cmd);
    else d.composerSetText(`${action.name} `);
    return;
  }
  switch (action.act) {
    case "new-chat":
      void d.newChatInFocus();
      break;
    case "new-session":
      void d.startSession();
      break;
    case "settings":
      d.openSettings();
      break;
    case "hub-skills":
      d.openHub("skills");
      break;
    case "hub-mcp":
      d.openHub("mcp");
      break;
    case "hub-plugins":
      d.openHub("skills");
      break;
    case "hub-hooks":
      d.openHub("hooks");
      break;
    case "hub-market":
      d.openHub("marketplace");
      break;
    case "fork":
      void d.sendPrompt("/fork");
      break;
    case "export": {
      const text = exportTranscript(d.chat.items);
      void navigator.clipboard.writeText(text).then(() => d.showToast(t(d.locale, "toast.copiedExport")));
      break;
    }
    case "theme": {
      const next = d.theme === "light" ? "dark" : "light";
      d.setTheme(next);
      d.persist({ theme: next });
      break;
    }
    case "panel": {
      const next = !d.reviewOpen;
      d.toggleReview(d.defaultRail);
      d.persist(persistReviewOpen(next));
      break;
    }
    case "context":
      d.openReview("plan");
      break;
    case "dashboard":
      d.setExtraPage("dashboard");
      break;
    case "imagine":
      d.setExtraPage("imagine");
      void d.listImagineArtifacts(d.cwd || null).then((paths) => {
        d.setImagineImages(paths.filter((p) => !/\.(mp4|webm)$/i.test(p)));
        d.setImagineVideos(paths.filter((p) => /\.(mp4|webm)$/i.test(p)));
      }).catch(() => {});
      break;
    case "agents":
      d.setExtraPage("agents");
      void d.listAgentsDir().then(d.setAgentRows).catch(() => {});
      break;
    case "memory":
      d.setExtraPage("memory");
      break;
    case "usage":
      d.setExtraPage("usage");
      break;
    case "add-project":
      void d.addProject();
      break;
    case "worktree":
      void d.newWorktreeSession();
      break;
    case "finder":
      if (d.cwd) void d.openPath(d.cwd);
      break;
  }
}
