import {
  MODEL_CATALOG,
  SLASH_COMMANDS,
  basename,
  displayTitle,
  filterCommands,
  filterProjectTree,
  groupSessions,
  MODE_OPTIONS,
  modeLabel,
  nextMode,
  parseRenameArgs,
  partitionWorkspace,
  progressPresentation,
  setTitleOverride,
  slashForMode,
} from "./lib.js";

const STORE = "grok-build-proto-webui";
const DESKTOP = "/Users/foxie/project_development/grok_build_desktop";
const BELDORE = "/Users/foxie/project_development/beldore";

const WORKSPACES = {
  [DESKTOP]: [
    { name: "_knowledge_base", path: `${DESKTOP}/_knowledge_base`, kind: "dir" },
    { name: "prototype", path: `${DESKTOP}/prototype`, kind: "dir" },
    { name: "src", path: `${DESKTOP}/src`, kind: "dir" },
    { name: "src-tauri", path: `${DESKTOP}/src-tauri`, kind: "dir" },
    { name: "package.json", path: `${DESKTOP}/package.json`, kind: "file" },
    { name: "README.md", path: `${DESKTOP}/README.md`, kind: "file" },
  ],
  [BELDORE]: [
    { name: "docs", path: `${BELDORE}/docs`, kind: "dir" },
    { name: "assets", path: `${BELDORE}/assets`, kind: "dir" },
    { name: "README.md", path: `${BELDORE}/README.md`, kind: "file" },
  ],
};

const FILES = {
  [DESKTOP]: ["src/App.tsx", "src/styles.css", "src/Settings.tsx", "src-tauri/src/lib.rs", "package.json"],
  [BELDORE]: ["docs/proposal.md", "assets/logo.svg"],
};

const seedSessions = () => [
  {
    id: "s-desktop-ui",
    cwd: DESKTOP,
    title: "流体对话列与假按键",
    model: "grok-4.6",
    dir: `${DESKTOP}/.grok-session/s-desktop-ui`,
    updatedAt: "2026-08-14T14:20:00Z",
    createdAt: "2026-08-14T10:00:00Z",
    numMessages: 6,
  },
  {
    id: "s-settings",
    cwd: DESKTOP,
    title: "设置页 MCP 排序",
    model: "grok-4.5",
    dir: `${DESKTOP}/.grok-session/s-settings`,
    updatedAt: "2026-08-14T09:10:00Z",
    createdAt: "2026-08-13T18:00:00Z",
    numMessages: 2,
  },
  {
    id: "s-beldore",
    cwd: BELDORE,
    title: "柏铎世家方案目录",
    model: "grok-4.6",
    dir: `${BELDORE}/.grok-session/s-beldore`,
    updatedAt: "2026-08-12T16:00:00Z",
    createdAt: "2026-08-12T15:00:00Z",
    numMessages: 1,
  },
];

function emptyChat() {
  return { items: [], plan: [], artifacts: [], usage: null };
}

const CHATS = {
  "s-desktop-ui": {
    items: [
      { kind: "user", id: "u1", text: "回复应该撑满对话框。窗口小了不要横向滚动条。假按键要么做成真的，要么删掉。" },
      {
        kind: "thought",
        id: "t1",
        text: "用户要的不是抄 Claude 的空控件。三栏各有一份工作：左侧找东西，中间是文档，右侧是本轮局势。占位只在空态出现。",
      },
      {
        kind: "tool",
        id: "tool1",
        title: "read App.tsx",
        status: "completed",
        detail: "src/App.tsx · 脚底齿轮、标题下拉、连接器、三对勾常驻",
      },
      {
        kind: "assistant",
        id: "a1",
        text: `<p>助手回复是文档，不是漂在中间的窄气泡。这一列跟着窗口走：宽过上限就停，窄了就缩，不要横向滚动条。</p>
<p>控件只保留有工作的：左下角太阳切日夜间，标题在栏上改，右侧去掉连接器，工作目录按文件夹和文件分块。有任务只显示任务，三个对勾只在空态出现。</p>
<pre><code>.thread { width: min(100%, var(--thread, 760px)); }
.msg.assistant { width: 100%; }</code></pre>
<p>参考 <a href="https://github.com">https://github.com</a> 只是演示链接条。</p>`,
      },
    ],
    plan: [
      { content: "流体对话列，禁止横向滚动", status: "completed" },
      { content: "太阳切换、标题覆写、搜索、模式分段", status: "in_progress" },
      { content: "工作目录分文件夹 / 文件 / 本轮文件", status: "pending" },
    ],
    artifacts: [{ path: `${DESKTOP}/src/App.tsx` }, { path: `${DESKTOP}/src/styles.css` }],
    usage: { used: 92_000, size: 200_000 },
  },
  "s-settings": {
    items: [
      { kind: "user", id: "u2", text: "设置里 MCP 每次点开都在变。" },
      { kind: "assistant", id: "a2", text: "<p>MCP 按名字排序，读 config.toml，不再每次 inspect。</p>" },
    ],
    plan: [],
    artifacts: [],
    usage: { used: 18_000, size: 200_000 },
  },
  "s-beldore": {
    items: [{ kind: "assistant", id: "a3", text: "<p>这是另一个项目下的会话。先项目，后会话。</p>" }],
    plan: [],
    artifacts: [],
    usage: { used: 4_200, size: 200_000 },
  },
};

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "{}");
  } catch {
    return {};
  }
}

function defaultState() {
  const prefs = loadPrefs();
  const projects = prefs.projects?.length ? prefs.projects : [DESKTOP, BELDORE];
  return {
    settingsOpen: false,
    theme: prefs.theme === "dark" ? "dark" : "light",
    model: prefs.model || "grok-4.6",
    mode: prefs.mode === "plan" || prefs.mode === "yolo" ? prefs.mode : "agent",
    chatWidth: typeof prefs.chatWidth === "number" ? prefs.chatWidth : 760,
    titles: prefs.titles && typeof prefs.titles === "object" ? prefs.titles : { "s-desktop-ui": "桌面端交互原型" },
    showThinking: prefs.showThinking !== false,
    yoloDefault: !!prefs.yolo,
    memory: prefs.memory !== false,
    telemetry: !!prefs.telemetry,
    effort: prefs.effort || "high",
    permissionMode: prefs.permissionMode || "ask",
    compactPercent: prefs.compactPercent || 85,
    mcp: prefs.mcp || [
      { name: "fff", enabled: true },
      { name: "pkulaw", enabled: true },
      { name: "voice", enabled: false },
    ],
    projects,
    sessions: seedSessions(),
    cwd: projects[0] || DESKTOP,
    openProjects: { [projects[0] || DESKTOP]: true },
    sessionId: "s-desktop-ui",
    chat: structuredClone(CHATS["s-desktop-ui"]),
    draft: "",
    busy: false,
    ready: true,
    loadingSession: false,
    railOpen: window.innerWidth >= 1100,
    railTouched: false,
    narrow: window.innerWidth < 1100,
    search: "",
    editingTitle: false,
    titleDraft: "",
    menu: null,
    modelOpen: false,
    modeOpen: false,
    slashOn: false,
    slashHits: [],
    mentionOn: false,
    mentionHits: [],
    permission: null,
    toast: null,
    openFolds: {},
    picking: false,
  };
}

const state = defaultState();
let toastTimer = 0;
const root = document.getElementById("root");

function persist() {
  localStorage.setItem(
    STORE,
    JSON.stringify({
      projects: state.projects,
      theme: state.theme,
      model: state.model,
      mode: state.mode,
      chatWidth: state.chatWidth,
      titles: state.titles,
      showThinking: state.showThinking,
      yolo: state.yoloDefault,
      memory: state.memory,
      telemetry: state.telemetry,
      effort: state.effort,
      permissionMode: state.permissionMode,
      compactPercent: state.compactPercent,
      mcp: state.mcp,
    }),
  );
}

function toast(msg) {
  state.toast = msg;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    state.toast = null;
    render();
  }, 2800);
  render();
}

function icon(name, size = 16) {
  const s = size;
  const common = `width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" aria-hidden="true"`;
  const map = {
    plus: `<svg ${common}><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    chevron: `<svg ${common} viewBox="0 0 12 12"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    more: `<svg ${common} fill="currentColor"><circle cx="4" cy="8" r="1.15"/><circle cx="8" cy="8" r="1.15"/><circle cx="12" cy="8" r="1.15"/></svg>`,
    copy: `<svg ${common}><rect x="5.5" y="5.5" width="7" height="8" rx="1.4" stroke="currentColor" stroke-width="1.3"/><path d="M3.5 10.5V4.2A1.7 1.7 0 0 1 5.2 2.5h5.3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
    up: `<svg ${common}><path d="M8 12.5V4.2M4.5 7.2 8 3.7l3.5 3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    panel: `<svg ${common}><rect x="2.5" y="3" width="11" height="10" rx="1.8" stroke="currentColor" stroke-width="1.3"/><path d="M10.5 3v10" stroke="currentColor" stroke-width="1.3"/></svg>`,
    spark: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1.6 13.1 8l5.3-3.2-3.2 5.3 6.4 1.1-6.4 1.1 3.2 5.3-5.3-3.2L12 22.4 10.9 16l-5.3 3.2 3.2-5.3L2.4 12.8l6.4-1.1L5.6 6.4 10.9 9.6 12 1.6Z"/></svg>`,
    check: `<svg ${common} viewBox="0 0 12 12"><path d="M2.4 6.2 4.8 8.6 9.6 3.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    gear: `<svg ${common}><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/><path d="M8 2.6v1.3M8 12.1v1.3M2.6 8h1.3M12.1 8h1.3M4.1 4.1l.9.9M11 11l.9.9M11.9 4.1l-.9.9M5 11l-.9.9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
    sun: `<svg ${common}><circle cx="8" cy="8" r="2.4" stroke="currentColor" stroke-width="1.3"/><path d="M8 2.4v1.2M8 12.4v1.2M2.4 8h1.2M12.4 8h1.2M4.1 4.1l.85.85M11.05 11.05l.85.85M11.9 4.1l-.85.85M4.95 11.05l-.85.85" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
    moon: `<svg ${common}><path d="M10.4 3.2A5.2 5.2 0 1 0 12.6 10 4.2 4.2 0 0 1 10.4 3.2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`,
    folder: `<svg ${common}><path d="M2.6 5.2V12a1.4 1.4 0 0 0 1.4 1.4h8a1.4 1.4 0 0 0 1.4-1.4V6.6A1.4 1.4 0 0 0 12 5.2H8.1L7 3.8H4A1.4 1.4 0 0 0 2.6 5.2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`,
    file: `<svg ${common}><path d="M4.4 2.6h5.1L12.4 5.5v7.9A1.2 1.2 0 0 1 11.2 14.6H4.8A1.2 1.2 0 0 1 3.6 13.4V3.8A1.2 1.2 0 0 1 4.8 2.6Z" stroke="currentColor" stroke-width="1.3"/><path d="M9.4 2.7V5.8h3" stroke="currentColor" stroke-width="1.3"/></svg>`,
  };
  return map[name] || "";
}

function sessionModel() {
  return state.sessions.find((s) => s.id === state.sessionId)?.model ?? null;
}

function currentSession() {
  return state.sessions.find((s) => s.id === state.sessionId) || null;
}

function currentTitle() {
  const s = currentSession();
  if (!s) return "新会话";
  return displayTitle(s, state.titles);
}

function applyNarrow(nextNarrow) {
  if (nextNarrow === state.narrow) return;
  state.narrow = nextNarrow;
  if (nextNarrow) {
    if (!state.railTouched) state.railOpen = false;
  } else if (!state.railTouched) {
    state.railOpen = true;
  }
}

function openPath(path) {
  toast(`原型：将打开 ${path}`);
}

function selectProject(path) {
  if (path === state.cwd) {
    state.openProjects = { ...state.openProjects, [path]: !state.openProjects[path] };
    render();
    return;
  }
  state.cwd = path;
  state.openProjects = { ...state.openProjects, [path]: true };
  state.sessionId = null;
  state.chat = emptyChat();
  state.editingTitle = false;
  render();
}

function resumeSession(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return;
  state.loadingSession = true;
  state.sessionId = id;
  state.cwd = s.cwd;
  state.openProjects = { ...state.openProjects, [s.cwd]: true };
  state.menu = null;
  render();
  window.setTimeout(() => {
    state.chat = structuredClone(CHATS[id] || emptyChat());
    state.loadingSession = false;
    render();
    scrollChat();
  }, 180);
}

function startSession() {
  if (!state.cwd) {
    addProject();
    return;
  }
  const id = `s-${Date.now()}`;
  const row = {
    id,
    cwd: state.cwd,
    title: "未命名会话",
    model: state.model,
    dir: `${state.cwd}/.grok-session/${id}`,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    numMessages: 0,
  };
  state.sessions = [row, ...state.sessions];
  state.sessionId = id;
  state.chat = emptyChat();
  state.editingTitle = false;
  CHATS[id] = emptyChat();
  render();
}

function removeSession(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return;
  if (!window.confirm(`删除会话「${displayTitle(s, state.titles)}」？`)) return;
  state.sessions = state.sessions.filter((x) => x.id !== id);
  state.titles = setTitleOverride(state.titles, id, "");
  persist();
  if (state.sessionId === id) {
    state.sessionId = null;
    state.chat = emptyChat();
  }
  state.menu = null;
  render();
}

function addProject() {
  const dir = window.prompt("项目路径（原型用文本代替访达）", "/Users/foxie/project_development/");
  if (!dir) return;
  if (dir === "/") {
    toast("请选择具体项目目录，不要选系统根目录");
    return;
  }
  const n = dir.replace(/\/+$/, "");
  if (!state.projects.includes(n)) state.projects = [...state.projects, n].sort((a, b) => basename(a).localeCompare(basename(b), "zh"));
  persist();
  selectProject(n);
}

function commitTitle(raw) {
  if (!state.sessionId) {
    state.editingTitle = false;
    render();
    return;
  }
  const t = raw.trim();
  if (!t || t === "--auto") {
    state.editingTitle = false;
    if (t === "--auto") toast("不能把 --auto 当作标题");
    render();
    return;
  }
  state.titles = setTitleOverride(state.titles, state.sessionId, t);
  persist();
  state.editingTitle = false;
  render();
}

function restoreGenerated() {
  if (!state.sessionId) return;
  state.titles = setTitleOverride(state.titles, state.sessionId, "");
  persist();
  state.menu = null;
  render();
}

function beginEditTitle() {
  if (!state.sessionId) return;
  state.editingTitle = true;
  state.titleDraft = currentTitle();
  state.menu = null;
  render();
  const el = root.querySelector(".title-input");
  el?.focus();
  el?.select();
}

function applyMode(next) {
  state.mode = next;
  state.modeOpen = false;
  persist();
  const live = !!(state.sessionId && state.ready && !state.loadingSession);
  if (live && state.busy) {
    toast("将在下一轮生效");
    render();
    return;
  }
  if (live && !state.busy) {
    sendSlashToAgent(slashForMode(next));
    return;
  }
  toast(`已记下 ${modeLabel(next)}，下一轮会话生效`);
  render();
}

function sendSlashToAgent(text) {
  state.busy = true;
  render();
  window.setTimeout(() => {
    state.busy = false;
    toast(`已向会话发送 ${text}`);
    render();
  }, 420);
}

function runSlash(cmd, rest = "") {
  state.slashOn = false;
  if (cmd.local === "new") return startSession();
  if (cmd.local === "settings") {
    openSettings();
    return;
  }
  if (cmd.local === "plan") return applyMode("plan");
  if (cmd.local === "yolo") return applyMode("yolo");
  if (cmd.local === "auto") return applyMode("agent");
  if (cmd.local === "delete" && state.sessionId) return removeSession(state.sessionId);
  if (cmd.local === "rename") {
    const parsed = parseRenameArgs(rest);
    if (parsed.kind === "error") return toast(parsed.message);
    if (!state.sessionId) return toast("没有可重命名的会话");
    if (parsed.kind === "auto") {
      restoreGenerated();
      return;
    }
    if (parsed.kind === "title") {
      state.titles = setTitleOverride(state.titles, state.sessionId, parsed.title);
      persist();
      render();
      return;
    }
    beginEditTitle();
    return;
  }
  state.draft = `${cmd.name} `;
  render();
  root.querySelector("textarea")?.focus();
}

function sendPrompt(text) {
  if (!text.trim() || state.busy || state.loadingSession) return;
  if (text.startsWith("/")) {
    const name = text.split(/\s/)[0];
    const found = filterCommands(name).find((c) => c.name === name);
    if (found?.local) {
      state.draft = "";
      return runSlash(found, text.slice(name.length).trimStart());
    }
  }
  if (!state.cwd) {
    toast("先选一个项目");
    return;
  }
  if (!state.sessionId) startSession();
  if (/删除全部|rm -rf/.test(text)) {
    state.permission = {
      title: "删除工作区文件",
      options: [
        { id: "allow", name: "允许一次", kind: "allow" },
        { id: "deny", name: "拒绝", kind: "deny" },
      ],
    };
    state.draft = text;
    render();
    return;
  }
  const sid = state.sessionId;
  state.chat.items.push({ kind: "user", id: `u-${Date.now()}`, text });
  state.draft = "";
  state.busy = true;
  state.slashOn = false;
  state.mentionOn = false;
  render();
  scrollChat();
  mockTurn(text, sid);
}

function mockTurn(text, sid) {
  const thought = { kind: "thought", id: `t-${Date.now()}`, text: `先看当前列宽和右侧模块，再改「${text.slice(0, 24)}」。` };
  const tool = {
    kind: "tool",
    id: `tool-${Date.now()}`,
    title: "read styles.css",
    status: "in_progress",
    detail: "核对 .thread / .msg / .rail",
  };
  window.setTimeout(() => {
    if (state.sessionId !== sid) return;
    state.chat.items.push(thought, tool);
    render();
    scrollChat();
  }, 280);
  window.setTimeout(() => {
    if (state.sessionId !== sid) return;
    tool.status = "completed";
    state.chat.plan = [
      { content: "改对话列宽度合同", status: "completed" },
      { content: text.slice(0, 28) || "继续当前任务", status: "in_progress" },
      { content: "核对窄窗无横向滚动", status: "pending" },
    ];
    const art = `${state.cwd}/src/styles.css`;
    if (!state.chat.artifacts.some((a) => a.path === art)) state.chat.artifacts.push({ path: art });
    state.chat.usage = { used: Math.min(180_000, (state.chat.usage?.used || 20_000) + 12_000), size: 200_000 };
    state.chat.items.push({
      kind: "assistant",
      id: `a-${Date.now()}`,
      text: `<p>这一段会撑满对话列。窗口拉窄时列跟着缩，超过 ${state.chatWidth}px 不再拉长。</p>
<p>进度有条目时只显示待办；工作目录按文件夹和文件分开。连接器不在右侧。</p>
<p><code>${escapeHtml(text)}</code></p>`,
    });
    CHATS[sid] = structuredClone(state.chat);
    const s = state.sessions.find((x) => x.id === sid);
    if (s) {
      s.updatedAt = new Date().toISOString();
      s.numMessages += 2;
      if (s.title === "未命名会话") s.title = text.slice(0, 18);
    }
    state.busy = false;
    render();
    scrollChat();
  }, 900);
}

function cancelTurn() {
  state.busy = false;
  if (state.permission) state.permission = null;
  toast("已停止");
  render();
}

function answerPermission(id) {
  const draft = state.draft;
  state.permission = null;
  if (id === "allow") {
    state.draft = "";
    sendPrompt(draft.replace(/删除全部|rm -rf/g, "清理构建产物"));
    return;
  }
  toast("已拒绝");
  render();
}

function pickModel(next) {
  const oldSession = sessionModel();
  state.model = next;
  persist();
  state.modelOpen = false;
  if (oldSession && oldSession !== next) {
    toast(`已写入默认模型，当前会话仍是 ${oldSession}。用 /model 可切换本会话。`);
  } else {
    toast(`默认模型已设为 ${next}`);
  }
  render();
}

function onDraftChange(value) {
  state.draft = value;
  if (value.startsWith("/")) {
    state.slashOn = true;
    state.slashHits = filterCommands(value);
    state.mentionOn = false;
    render();
    return;
  }
  state.slashOn = false;
  const at = value.lastIndexOf("@");
  if (at >= 0 && state.cwd) {
    const q = value.slice(at + 1).split(/\s/)[0].toLowerCase();
    if (!value.slice(at + 1).includes("\n")) {
      state.mentionOn = true;
      state.mentionHits = (FILES[state.cwd] || []).filter((f) => f.toLowerCase().includes(q)).slice(0, 12);
      render();
      return;
    }
  }
  state.mentionOn = false;
  render();
}

function scrollChat() {
  requestAnimationFrame(() => {
    const el = root.querySelector(".chat");
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMdPlain(text) {
  return escapeHtml(text).replace(/\n/g, "<br/>");
}

function openSettings() {
  state.settingsOpen = true;
  closeMenus();
  render();
}

function closeSettings() {
  state.settingsOpen = false;
  render();
}

function toggleRail() {
  state.railTouched = true;
  state.railOpen = !state.railOpen;
  state.menu = null;
  render();
}

function setRailOpen(open) {
  state.railTouched = true;
  state.railOpen = open;
  render();
}

function closeMenus() {
  state.menu = null;
  state.modelOpen = false;
  state.modeOpen = false;
}

function render() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.style.setProperty("--thread", `${state.chatWidth}px`);

  const appClass = [
    "app",
    state.narrow ? "narrow" : "",
    !state.railOpen ? "norail" : "",
    state.narrow && state.railOpen ? "rail-overlay" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const tree = filterProjectTree(groupSessions(state.projects, state.sessions), state.search, state.titles);
  const s = currentSession();
  const title = currentTitle();
  const usage = state.chat.usage;
  const usagePct = usage?.size ? Math.min(100, Math.round(((usage.used || 0) / usage.size) * 100)) : 0;
  const progress = progressPresentation(state.chat.plan);
  const entries = partitionWorkspace(WORKSPACES[state.cwd] || []);
  const lastAssistant = [...state.chat.items].reverse().find((i) => i.kind === "assistant");
  const urlChips = lastAssistant
    ? Array.from(String(lastAssistant.text).matchAll(/https?:\/\/[^\s)<>"']+/g)).map((m) => m[0]).filter((u, i, a) => a.indexOf(u) === i).slice(0, 3)
    : [];
  root.innerHTML = `
    <div class="${appClass}">
      ${renderSidebar(tree, title)}
      <main class="workspace">
        ${renderHead(s, title)}
        ${state.narrow && state.railOpen ? `<div class="rail-backdrop" data-act="close-rail"></div>` : ""}
        ${renderChat(urlChips, progress)}
      </main>
      ${state.railOpen ? renderRail(progress, entries, usagePct) : ""}
      ${state.settingsOpen ? renderSettings() : ""}
      ${state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : ""}
      ${state.menu ? renderMenu() : ""}
    </div>
  `;

  bindStatic();
}

function renderSidebar(tree, activeTitle) {
  return `
    <aside class="sidebar">
      <div class="titlebar"><span class="proto-flag">原型 · 数据为模拟</span><span class="proto-meter">${window.innerWidth} · ${state.narrow ? "浮层" : "三栏"}</span></div>
      <div class="side-pad">
        <button class="new-task" data-act="new-session"><span class="plus">${icon("plus", 14)}</span>新会话</button>
      </div>
      <div class="section-label">最近</div>
      <input class="search" placeholder="搜索项目或会话" value="${escapeHtml(state.search)}" data-act="search" />
      <div class="session-list">
        ${tree
          .map(
            (p) => `
          <details class="project" data-path="${escapeHtml(p.path)}" ${state.openProjects[p.path] || p.path === state.cwd ? "open" : ""}>
            <summary>
              <span class="chev">${icon("chevron", 11)}</span>
              <span class="pname" title="${escapeHtml(p.path)}">${escapeHtml(p.name)}</span>
            </summary>
            ${p.sessions
              .map((sess) => {
                const label = displayTitle(sess, state.titles);
                return `
                <div class="session ${sess.id === state.sessionId ? "active" : ""}">
                  <button class="title" data-act="resume" data-id="${sess.id}">${escapeHtml(label)}</button>
                  <button class="more" data-act="row-menu" data-id="${sess.id}" aria-label="会话操作">${icon("more")}</button>
                </div>`;
              })
              .join("")}
          </details>`,
          )
          .join("")}
        <button class="new-task" data-act="add-project"><span class="plus">${icon("plus", 14)}</span>添加项目</button>
      </div>
      <p class="footnote">这些会话在本机执行，不会在设备之间同步。</p>
      <div class="side-foot">
        <div class="avatar">G</div>
        <div class="who grow">
          <strong>Grok Build</strong>
          <small>${state.ready ? "已连接" : "未连接"} · 原型</small>
        </div>
        <div class="foot-actions">
          <button class="icon-btn" data-act="theme" aria-label="切换浅色/深色" title="日间 / 夜间">
            ${state.theme === "dark" ? icon("moon") : icon("sun")}
          </button>
          <button class="icon-btn" data-act="open-settings" aria-label="设置" title="设置">
            ${icon("gear")}
          </button>
        </div>
      </div>
    </aside>
  `;
}

function renderHead(s, title) {
  const heading = state.editingTitle
        ? `<input class="title-input" value="${escapeHtml(state.titleDraft)}" data-act="title-input" />`
        : state.sessionId
          ? `<button type="button" class="session-title-btn" data-act="edit-title">${escapeHtml(title)}</button>
             <button type="button" class="icon-btn" data-act="header-menu" aria-label="会话操作">${icon("chevron")}</button>`
          : `<span class="title-static">新会话</span>`;
  return `
    <header class="workspace-head">
      <div class="title-wrap">${heading}</div>
      <div class="head-actions">
        <button class="icon-btn" data-act="toggle-rail" title="侧栏">${icon("panel")}</button>
      </div>
    </header>
  `;
}

function renderChat(urlChips, progress) {
  const empty = state.chat.items.length === 0 && !state.loadingSession;
  return `
    <div class="chat">
      <div class="thread">
        ${
          empty
            ? `<div class="empty"><h2>从左侧选一个项目，再打开会话</h2><p>项目是文件夹，会话是这个文件夹里的对话。先项目、后会话。</p></div>`
            : `
          ${
            urlChips.length
              ? `<div class="url-row">${urlChips.map((u) => `<button class="url-chip" data-act="open" data-path="${escapeHtml(u)}">${escapeHtml(u)}</button>`).join("")}</div>`
              : ""
          }
          ${progress.kind === "list" ? `<button class="view-steps" data-act="view-steps">查看步骤 &gt;</button>` : ""}
          ${state.chat.items.map(renderItem).join("")}
          ${state.busy ? `<div class="spark" data-act="cancel" title="停止">${icon("spark")}</div>` : ""}`
        }
      </div>
    </div>
    ${state.loadingSession ? `<div class="overlay"><div class="spinner"></div><div>正在载入会话…</div></div>` : ""}
    <div class="composer-wrap">
      ${
        state.permission
          ? `<div class="permission"><h4>许可请求</h4><p>${escapeHtml(state.permission.title)}</p><div class="opts">${state.permission.options
              .map(
                (o, i) =>
                  `<button class="btn ${o.kind?.startsWith("allow") ? "primary" : ""}" data-act="perm" data-id="${o.id}">${i + 1} ${escapeHtml(o.name)}</button>`,
              )
              .join("")}</div></div>`
          : ""
      }
      ${
        state.slashOn && state.slashHits.length
          ? `<div class="mention">${state.slashHits
              .map((c) => `<button data-act="slash" data-name="${escapeHtml(c.name)}"><strong>${escapeHtml(c.name)}</strong><span style="color:var(--muted);margin-left:8px">${escapeHtml(c.hint)}</span></button>`)
              .join("")}</div>`
          : ""
      }
      ${
        state.mentionOn && state.mentionHits.length
          ? `<div class="mention">${state.mentionHits
              .map((f) => `<button data-act="mention" data-file="${escapeHtml(f)}">${escapeHtml(f)}</button>`)
              .join("")}</div>`
          : ""
      }
      <div class="composer">
        <textarea data-act="draft" placeholder="回复…">${escapeHtml(state.draft)}</textarea>
        <div class="composer-foot">
          <div class="left">
            <button class="plus-btn" data-act="slash-open" title="命令">${icon("plus", 18)}</button>
          </div>
          <div class="right">
            <div class="chip-wrap">
              <button class="mode-chip ${state.mode === "yolo" ? "yolo" : ""}" data-act="mode-open" aria-label="切换模式" aria-expanded="${state.modeOpen ? "true" : "false"}">${escapeHtml(modeLabel(state.mode))} ${icon("chevron", 11)}</button>
              ${state.modeOpen ? renderModeMenu() : ""}
            </div>
            <div class="chip-wrap">
              <button class="model-chip" data-act="model-open">${escapeHtml(sessionModel() || state.model)} ${icon("chevron", 11)}</button>
              ${state.modelOpen ? renderModelMenu() : ""}
            </div>
            <button class="send-btn" data-act="send" ${!state.draft.trim() || !state.cwd || state.busy ? "disabled" : ""}>${icon("up")}</button>
          </div>
        </div>
      </div>
      <div class="disclaimer">Grok 会出错。重要结果请自行核对。</div>
    </div>
  `;
}

function renderItem(item) {
  if (item.kind === "user") {
    return `<article class="msg user"><div class="md">${renderMdPlain(item.text)}</div></article>`;
  }
  if (item.kind === "assistant") {
    return `<article class="msg assistant"><div class="md">${item.text}</div><div class="actions"><button class="icon-btn" data-act="copy" data-id="${item.id}" aria-label="复制">${icon("copy")}</button></div></article>`;
  }
  if (item.kind === "thought" && !state.showThinking) return "";
  if (item.kind === "thought") {
    const preview = item.text.replace(/\s+/g, " ").slice(0, 72);
    return renderFold(item.id, preview ? `思考  ${preview}${item.text.length > 72 ? "…" : ""}` : "思考", "", `<div class="thought">${escapeHtml(item.text)}</div>`);
  }
  return renderFold(
    item.id,
    item.title || "工具调用",
    item.status || "",
    item.detail ? `<pre>${escapeHtml(item.detail)}</pre>` : `<p class="thought">无详细输出</p>`,
  );
}

function renderFold(id, label, meta, body) {
  const open = !!state.openFolds[id];
  return `
    <div class="fold ${open ? "open" : ""}">
      <button type="button" class="fold-head" data-act="fold" data-id="${id}">
        <span class="fold-chev">${icon("chevron", 12)}</span>
        <span class="fold-label">${escapeHtml(label)}</span>
        ${meta ? `<span class="fold-meta ${escapeHtml(meta)}">${escapeHtml(meta)}</span>` : ""}
      </button>
      ${open ? `<div class="fold-body">${body}</div>` : ""}
    </div>
  `;
}

function renderRail(progress, entries, usagePct) {
  const planBlock =
    progress.kind === "empty"
      ? `<div class="steps"><div class="step"></div><div class="step-line"></div><div class="step"></div><div class="step-line"></div><div class="step"></div></div>
         <p>较长任务的待办会显示在这里。Grok 列出计划后，这里会逐条勾上。</p>`
      : `<ul class="todo">${progress.entries
          .map(
            (e) =>
              `<li class="${e.status || "pending"}"><span class="box">${e.status === "completed" ? icon("check", 10) : e.status === "in_progress" ? "•" : ""}</span>${escapeHtml(e.content)}</li>`,
          )
          .join("")}</ul>`;

  const dirBody = !state.cwd
    ? `<p>尚未选择项目</p>`
    : `
      <div class="cwd-head">
        <strong>${escapeHtml(basename(state.cwd))}</strong>
        <button class="btn ghost" data-act="open" data-path="${escapeHtml(state.cwd)}">在访达中打开</button>
      </div>
      ${
        entries.dirs.length
          ? `<div class="dir-mod"><h4>文件夹</h4>${entries.dirs
              .map((e) => `<button class="dir-row" data-act="open" data-path="${escapeHtml(e.path)}"><span class="ico">${icon("folder")}</span><span>${escapeHtml(e.name)}/</span></button>`)
              .join("")}</div>`
          : ""
      }
      ${
        entries.files.length
          ? `<div class="dir-mod"><h4>文件</h4>${entries.files
              .map((e) => `<button class="dir-row" data-act="open" data-path="${escapeHtml(e.path)}"><span class="ico">${icon("file")}</span><span>${escapeHtml(e.name)}</span></button>`)
              .join("")}</div>`
          : ""
      }
      ${
        state.chat.artifacts.length
          ? `<div class="dir-mod"><h4>本轮文件</h4>${state.chat.artifacts
              .slice(-8)
              .map((a) => `<button class="dir-row" data-act="open" data-path="${escapeHtml(a.path)}"><span class="ico">${icon("file")}</span><span>${escapeHtml(basename(a.path))}</span></button>`)
              .join("")}</div>`
          : ""
      }`;

  return `
    <aside class="rail">
      <div class="card">
        <h3>进度</h3>
        ${planBlock}
      </div>
      <div class="card">
        <h3>工作目录</h3>
        ${dirBody}
      </div>
      <div class="card">
        <h3>上下文</h3>
        <p>${state.chat.usage?.size ? `已用 ${usagePct}%` : "连接后显示用量"}</p>
        ${state.chat.usage?.size ? `<div class="usage-bar"><i style="width:${usagePct}%"></i></div>` : ""}
      </div>
    </aside>
  `;
}

function renderMenu() {
  const s = state.menu.kind === "row" ? state.sessions.find((x) => x.id === state.menu.id) : currentSession();
  if (!s) return "";
  const hasOverride = !!state.titles[s.id];
  return `
    <div class="menu" style="top:${state.menu.top}px;left:${state.menu.left}px">
      <button data-act="menu-rename" data-id="${s.id}">重命名</button>
      <button data-act="menu-restore" data-id="${s.id}" ${hasOverride ? "" : "disabled"}>恢复自动标题</button>
      <button data-act="menu-new">在此项目新开会话</button>
      <div class="sep"></div>
      <button data-act="open" data-path="${escapeHtml(s.dir || s.cwd)}">在访达中显示</button>
      <button data-act="copy-text" data-text="${escapeHtml(s.id)}">复制会话 ID</button>
      <button data-act="copy-text" data-text="${escapeHtml(s.cwd)}">复制项目路径</button>
      <div class="sep"></div>
      <button class="danger" data-act="menu-delete" data-id="${s.id}">删除</button>
    </div>
  `;
}

function renderModelMenu() {
  const opts = [...new Set([state.model, ...MODEL_CATALOG])];
  return `
    <div class="chip-menu">
      ${opts
        .map(
          (m) =>
            `<button data-act="pick-model" data-model="${escapeHtml(m)}"><span>${escapeHtml(m)}</span><span>${m === state.model ? icon("check", 12) : ""}</span></button>`,
        )
        .join("")}
      <button class="foot" data-act="open-settings">在设置中管理…</button>
    </div>
  `;
}

function renderModeMenu() {
  return `
    <div class="chip-menu mode-menu">
      ${MODE_OPTIONS.map(
        (o) =>
          `<button data-act="pick-mode" data-mode="${o.id}" class="${o.id === "yolo" ? "yolo" : ""}">
            <span class="mode-row"><span>${escapeHtml(o.label)}</span><span>${o.id === state.mode ? icon("check", 12) : ""}</span></span>
            <span class="hint">${escapeHtml(o.hint)}</span>
          </button>`,
      ).join("")}
    </div>
  `;
}

function renderSettings() {
  const mcp = [...state.mcp].sort((a, b) => a.name.localeCompare(b.name));
  return `
    <div class="settings-layer">
      <div class="settings-backdrop" data-act="close-settings"></div>
      <div class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div class="settings-head">
          <h2 id="settings-title">设置</h2>
          <button class="icon-btn" data-act="close-settings" aria-label="关闭设置">×</button>
        </div>
        <div class="settings">
      <p class="lead">这是 Grok Build CLI 的图形壳。会话、模型、MCP 都来自 <code>~/.grok</code>，不是另一套配置。原型把这些写在浏览器本地存储里，接上接口后改回 config.toml。</p>
      <h3>外观</h3>
      <div class="field"><div class="row"><label>浅色 / 深色</label><button class="toggle ${state.theme === "dark" ? "on" : ""}" data-act="theme"><i></i></button></div></div>
      <div class="field">
        <label>对话列最大宽度 ${state.chatWidth}px</label>
        <input type="range" min="560" max="920" step="20" value="${state.chatWidth}" data-act="width" />
      </div>
      <h3>Agent</h3>
      <div class="field"><label>默认模型</label><select data-act="set-model">${MODEL_CATALOG.map((m) => `<option ${m === state.model ? "selected" : ""}>${m}</option>`).join("")}</select></div>
      <div class="field"><label>推理力度</label><select data-act="effort">${["low", "medium", "high", "xhigh"].map((v) => `<option ${v === state.effort ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div class="field"><label>许可模式</label><select data-act="perm-mode">
        <option value="ask" ${state.permissionMode === "ask" ? "selected" : ""}>ask（每次询问）</option>
        <option value="always-approve" ${state.permissionMode === "always-approve" ? "selected" : ""}>always-approve</option>
        <option value="auto" ${state.permissionMode === "auto" ? "selected" : ""}>auto</option>
      </select></div>
      <div class="field"><div class="row"><label>YOLO（跳过许可）</label><button class="toggle ${state.yoloDefault ? "on" : ""}" data-act="yolo-default"><i></i></button></div></div>
      <div class="field"><div class="row"><label>显示思考过程</label><button class="toggle ${state.showThinking ? "on" : ""}" data-act="thinking"><i></i></button></div></div>
      <div class="field"><label>自动压缩阈值 ${state.compactPercent}%</label><input type="range" min="50" max="95" value="${state.compactPercent}" data-act="compact" /></div>
      <h3>功能</h3>
      <div class="field"><div class="row"><label>跨会话记忆</label><button class="toggle ${state.memory ? "on" : ""}" data-act="memory"><i></i></button></div></div>
      <div class="field"><div class="row"><label>匿名遥测</label><button class="toggle ${state.telemetry ? "on" : ""}" data-act="telemetry"><i></i></button></div></div>
      <h3>MCP（${mcp.length}）</h3>
      <p class="lead">来自 config.toml，按名称排序。不会每次点开设置就重新握手。</p>
      <ul class="mcp-list">${mcp
        .map(
          (s) =>
            `<li><span>${escapeHtml(s.name)}</span><button class="toggle ${s.enabled ? "on" : ""}" data-act="mcp" data-name="${escapeHtml(s.name)}"><i></i></button></li>`,
        )
        .join("")}</ul>
      <h3>账户</h3>
      <div class="field">
        <p>Grok Build 1.0.3（模拟）</p>
        <p>已登录</p>
      </div>
        </div>
      </div>
    </div>
  `;
}

function bindStatic() {
  const ta = root.querySelector("textarea[data-act=draft]");
  if (ta) {
    ta.style.height = "42px";
    ta.style.height = `${Math.min(150, ta.scrollHeight)}px`;
    if (document.activeElement === document.body && !state.settingsOpen && !state.editingTitle && !state.menu) {
      /* keep focus only when user was typing — restored below via dataset */
    }
  }
}

function placeMenu(kind, id, el) {
  const r = el.getBoundingClientRect();
  const left = Math.min(window.innerWidth - 210, Math.max(8, r.left));
  const top = Math.min(window.innerHeight - 280, r.bottom + 4);
  state.menu = { kind, id, top, left };
  render();
}

root.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) {
    if (!e.target.closest(".menu") && !e.target.closest(".chip-menu") && !e.target.closest(".chip-wrap")) {
      if (state.menu || state.modelOpen || state.modeOpen) {
        closeMenus();
        render();
      }
    }
    return;
  }
  const act = btn.dataset.act;
  if (act === "open-settings") {
    e.stopPropagation();
    openSettings();
    return;
  }
  if (act === "close-settings") {
    closeSettings();
    return;
  }
  if (act === "theme") {
    state.theme = state.theme === "light" ? "dark" : "light";
    persist();
    render();
    return;
  }
  if (act === "new-session") return startSession();
  if (act === "add-project") return addProject();
  if (act === "resume") return resumeSession(btn.dataset.id);
  if (act === "row-menu") {
    e.stopPropagation();
    placeMenu("row", btn.dataset.id, btn);
    return;
  }
  if (act === "header-menu") {
    e.stopPropagation();
    placeMenu("header", state.sessionId, btn);
    return;
  }
  if (act === "edit-title") return beginEditTitle();
  if (act === "toggle-rail") return toggleRail();
  if (act === "close-rail") return setRailOpen(false);
  if (act === "view-steps") return setRailOpen(true);
  if (act === "open") return openPath(btn.dataset.path);
  if (act === "copy") {
    const item = state.chat.items.find((i) => i.id === btn.dataset.id);
    if (item?.kind === "assistant") {
      navigator.clipboard.writeText(item.text.replace(/<[^>]+>/g, ""));
      toast("已复制");
    }
    return;
  }
  if (act === "copy-text") {
    navigator.clipboard.writeText(btn.dataset.text || "");
    closeMenus();
    toast("已复制");
    return;
  }
  if (act === "fold") {
    state.openFolds[btn.dataset.id] = !state.openFolds[btn.dataset.id];
    render();
    return;
  }
  if (act === "slash-open") {
    state.draft = "/";
    state.slashOn = true;
    state.slashHits = filterCommands("/");
    render();
    root.querySelector("textarea")?.focus();
    return;
  }
  if (act === "slash") {
    const cmd = SLASH_COMMANDS.find((c) => c.name === btn.dataset.name);
    if (cmd) runSlash(cmd);
    return;
  }
  if (act === "mention") {
    const at = state.draft.lastIndexOf("@");
    state.draft = `${state.draft.slice(0, at)}@${btn.dataset.file} `;
    state.mentionOn = false;
    render();
    root.querySelector("textarea")?.focus();
    return;
  }
  if (act === "send") return sendPrompt(state.draft);
  if (act === "cancel") return cancelTurn();
  if (act === "perm") return answerPermission(btn.dataset.id);
  if (act === "mode-open") {
    e.stopPropagation();
    state.modeOpen = !state.modeOpen;
    state.modelOpen = false;
    render();
    return;
  }
  if (act === "pick-mode") {
    closeMenus();
    return applyMode(btn.dataset.mode);
  }
  if (act === "model-open") {
    e.stopPropagation();
    state.modelOpen = !state.modelOpen;
    state.modeOpen = false;
    render();
    return;
  }
  if (act === "pick-model") return pickModel(btn.dataset.model);
  if (act === "menu-rename") {
    state.sessionId = btn.dataset.id;
    beginEditTitle();
    return;
  }
  if (act === "menu-restore") {
    state.sessionId = btn.dataset.id;
    restoreGenerated();
    return;
  }
  if (act === "menu-new") {
    closeMenus();
    startSession();
    return;
  }
  if (act === "menu-delete") return removeSession(btn.dataset.id);
  if (act === "thinking") {
    state.showThinking = !state.showThinking;
    persist();
    render();
    return;
  }
  if (act === "yolo-default") {
    state.yoloDefault = !state.yoloDefault;
    persist();
    render();
    return;
  }
  if (act === "memory") {
    state.memory = !state.memory;
    persist();
    render();
    return;
  }
  if (act === "telemetry") {
    state.telemetry = !state.telemetry;
    persist();
    render();
    return;
  }
  if (act === "mcp") {
    state.mcp = state.mcp.map((m) => (m.name === btn.dataset.name ? { ...m, enabled: !m.enabled } : m));
    persist();
    render();
  }
});

root.addEventListener("input", (e) => {
  const el = e.target;
  if (!(el instanceof HTMLElement)) return;
  const act = el.dataset.act;
  if (act === "search") {
    state.search = el.value;
    render();
    const again = root.querySelector(".search");
    if (again) {
      again.focus();
      again.setSelectionRange(state.search.length, state.search.length);
    }
    return;
  }
  if (act === "draft") {
    onDraftChange(el.value);
    const ta = root.querySelector("textarea[data-act=draft]");
    if (ta) {
      ta.focus();
      ta.setSelectionRange(state.draft.length, state.draft.length);
    }
    return;
  }
  if (act === "title-input") {
    state.titleDraft = el.value;
    return;
  }
  if (act === "width") {
    state.chatWidth = Number(el.value);
    persist();
    render();
    return;
  }
  if (act === "compact") {
    state.compactPercent = Number(el.value);
    persist();
    render();
  }
});

root.addEventListener("change", (e) => {
  const el = e.target;
  if (!(el instanceof HTMLElement)) return;
  if (el.dataset.act === "set-model") {
    pickModel(el.value);
    return;
  }
  if (el.dataset.act === "effort") {
    state.effort = el.value;
    persist();
    return;
  }
  if (el.dataset.act === "perm-mode") {
    state.permissionMode = el.value;
    persist();
  }
});

root.addEventListener("toggle", (e) => {
  const el = e.target;
  if (!(el instanceof HTMLDetailsElement) || !el.classList.contains("project")) return;
  const path = el.dataset.path;
  state.openProjects = { ...state.openProjects, [path]: el.open };
  if (el.open && path !== state.cwd) selectProject(path);
}, true);

root.addEventListener("keydown", (e) => {
  const el = e.target;
  if (el instanceof HTMLInputElement && el.dataset.act === "title-input") {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTitle(el.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      state.editingTitle = false;
      render();
    }
    return;
  }
  if (el instanceof HTMLTextAreaElement && e.key === "Tab" && e.shiftKey) {
    if (state.slashOn || state.mentionOn) return;
    e.preventDefault();
    applyMode(nextMode(state.mode));
    return;
  }
  if (el instanceof HTMLTextAreaElement && e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (state.slashOn && state.slashHits[0]) {
      runSlash(state.slashHits[0]);
      return;
    }
    sendPrompt(state.draft);
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (state.editingTitle) {
    state.editingTitle = false;
    render();
    return;
  }
  if (state.menu || state.modelOpen || state.modeOpen) {
    closeMenus();
    render();
    return;
  }
  if (state.settingsOpen) {
    closeSettings();
    return;
  }
  if (state.narrow && state.railOpen) {
    setRailOpen(false);
  }
});

window.addEventListener("keydown", (e) => {
  if (!state.permission) return;
  const n = Number(e.key);
  if (n >= 1 && n <= state.permission.options.length) {
    e.preventDefault();
    answerPermission(state.permission.options[n - 1].id);
  }
});

const mq = window.matchMedia("(max-width: 1099px)");
applyNarrow(mq.matches);
mq.addEventListener("change", (ev) => {
  applyNarrow(ev.matches);
  render();
});

window.addEventListener("resize", () => {
  const meter = root.querySelector(".proto-meter");
  if (meter) meter.textContent = `${window.innerWidth} · ${state.narrow ? "浮层" : "三栏"}`;
});

render();
