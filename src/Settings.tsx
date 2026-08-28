import { useEffect, useState } from "react";
import {
  ensureInbox,
  openPath,
  patchCliSettings,
  pickDirectory,
  type CliSettings,
  type DoctorInfo,
} from "./api";
import { MenuSelect } from "./components/MenuSelect";
import { EFFORT_OPTIONS, normalizeEffort } from "./lib/effort";
import { t, type Locale } from "./lib/i18n";
import { permissionModeHint } from "./lib/permission-copy";
import { UPDATE_INSTALLATION_COPY } from "./lib/product-copy";
import { stateAuthorityExplanation } from "./lib/state-authority";
import { settingRowVisible } from "./lib/settings-search";
import { ShortcutsTable } from "./components/ShortcutsTable";
import { ManagedConfigView } from "./components/ManagedConfigView";
import { UsageStats } from "./components/UsageStats";
import { DEFAULT_SHORTCUTS } from "./lib/shortcuts-table";
import type { HubTab } from "./lib/commands";
import type { InspectReport } from "./lib/inspect";
import { enabledMcpCount } from "./lib/inspect";
import { IconGrokSearch } from "./grok-icons";

type TabId = "overview" | "appearance" | "chat" | "extensions" | "usage" | "about";

type Props = {
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
  chatWidth: number;
  setChatWidth: (n: number) => void;
  inboxCwd: string;
  onInboxCwd: (path: string) => void;
  chatFontSize: number;
  setChatFontSize: (n: number) => void;
  cli: CliSettings | null;
  onCli: (next: CliSettings) => void;
  info: DoctorInfo | null;
  enterSends?: boolean;
  onEnterSends?: (v: boolean) => void;
  autoArchiveDays?: number;
  onAutoArchiveDays?: (n: number) => void;
  steerByDefault?: boolean;
  onSteerByDefault?: (v: boolean) => void;
  locale?: Locale;
  onLocale?: (l: Locale) => void;
  themeFamily?: "default" | "paper" | "ink";
  onThemeFamily?: (f: "default" | "paper" | "ink") => void;
  density?: "comfortable" | "compact";
  onDensity?: (d: "comfortable" | "compact") => void;
  hideToTray?: boolean;
  onHideToTray?: (v: boolean) => void;
  defaultRail?: "tasks" | "changes" | "context";
  onDefaultRail?: (v: "tasks" | "changes" | "context") => void;
  inspect?: InspectReport | null;
  doctorNote?: string | null;
  onOpenHub?: (tab: HubTab) => void;
  onRefreshHealth?: () => void;
  shortcuts?: Record<string, string>;
  onShortcut?: (id: string, binding: string) => void;
  managedText?: string;
  managedPath?: string;
  agentReady?: boolean;
  agentConnecting?: boolean;
  agentDisconnected?: boolean;
  onRestartAgent?: () => void;
  focusSection?: "shortcuts" | null;
  onConsumedFocus?: () => void;
};

export function SettingsPanel({
  theme,
  setTheme,
  chatWidth,
  setChatWidth,
  inboxCwd,
  onInboxCwd,
  chatFontSize,
  setChatFontSize,
  cli,
  onCli,
  info,
  enterSends,
  onEnterSends,
  autoArchiveDays,
  onAutoArchiveDays,
  steerByDefault,
  onSteerByDefault,
  locale = "zh",
  onLocale,
  themeFamily = "default",
  onThemeFamily,
  density = "comfortable",
  onDensity,
  hideToTray = true,
  onHideToTray,
  defaultRail = "tasks",
  onDefaultRail,
  inspect,
  doctorNote,
  onOpenHub,
  onRefreshHealth,
  shortcuts,
  onShortcut,
  managedText,
  managedPath,
  agentReady,
  agentConnecting,
  agentDisconnected,
  onRestartAgent,
  focusSection = null,
  onConsumedFocus,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [settingsQuery, setSettingsQuery] = useState("");

  useEffect(() => {
    if (focusSection !== "shortcuts") return;
    setTab("chat");
    const node = document.getElementById("settings-shortcuts");
    if (node) {
      node.scrollIntoView();
      onConsumedFocus?.();
      return;
    }
    if (tab === "chat") onConsumedFocus?.();
  }, [focusSection, tab, onConsumedFocus]);

  async function patch(partial: Partial<CliSettings>) {
    if (!cli) return;
    const next = { ...cli, ...partial };
    onCli(next);
    setBusy(true);
    try {
      await patchCliSettings(partial);
      setNote(stateAuthorityExplanation("patchCliSettings"));
    } catch (e) {
      setNote(String(e));
      onCli(cli);
    } finally {
      setBusy(false);
    }
  }

  const mcp = [...(cli?.mcp ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const enterSendsOn = enterSends !== false;
  const archiveDays = autoArchiveDays && autoArchiveDays > 0 ? autoArchiveDays : 0;
  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: t(locale, "settings.overview") },
    { id: "appearance", label: t(locale, "settings.appearance") },
    { id: "chat", label: t(locale, "settings.chat") },
    { id: "extensions", label: t(locale, "settings.extensions") },
    { id: "usage", label: t(locale, "settings.usage") },
    { id: "about", label: t(locale, "settings.about") },
  ];
  const skillCount = inspect?.skills.length ?? 0;
  const pluginCount = inspect?.plugins.length ?? 0;
  const hookCount = inspect?.hooks.length ?? 0;
  const mcpCount = inspect ? enabledMcpCount(inspect.mcpServers) : mcp.filter((s) => s.enabled).length;

  const show = (title: string, description = "") => settingRowVisible(title, description, settingsQuery);
  const searching = settingsQuery.trim().length > 0;

  const overviewCli = show(t(locale, "health.cli"));
  const overviewLogin = show(t(locale, "health.login"));
  const overviewInspect = show(t(locale, "health.inspect"));
  const overviewMcp = show("MCP");
  const overviewAgent = show("Agent");
  const overviewInbox = show("独立对话", "收件箱目录");
  const overviewHealth = overviewCli || overviewLogin || overviewInspect || overviewMcp || overviewAgent;
  const overviewHas = overviewHealth || overviewInbox;

  const appearanceDark = show("深色模式");
  const appearanceFamily = show("主题族", "默认 Paper 暖纸 Ink 高对比");
  const appearanceDensity = show("密度");
  const appearanceLocale = show("界面语言");
  const appearanceWidth = show("对话宽度");
  const appearanceFont = show("正文字号");
  const appearanceRail = show("审阅默认标签");
  const appearanceTray = show("关闭窗口进托盘");
  const appearanceTheme = appearanceDark || appearanceFamily;
  const appearanceLayout = appearanceDensity || appearanceWidth || appearanceFont;
  const appearanceHas =
    appearanceTheme || appearanceLayout || appearanceLocale || appearanceRail || appearanceTray;

  const sendDesc = "Enter 发送或 ⌘Enter";
  const steerDesc = "排队到轮末或不打断正在跑的这一轮 立即改向";
  const shortcutDesc = DEFAULT_SHORTCUTS.map((row) => `${row.action} ${row.defaultBinding}`).join(" ");
  const chatSend = show("发送快捷键", sendDesc);
  const chatSteer = show("中途改向", steerDesc);
  const chatArchive = show("自动归档（天）");
  const chatThinking = show("显示思考过程");
  const chatCompact = show("自动压缩阈值");
  const chatMemory = show("跨会话记忆");
  const chatTelemetry = show("匿名遥测");
  const chatModel = show("默认模型");
  const chatEffort = show("推理力度");
  const chatPermission = show("许可模式", permissionModeHint(cli?.permissionMode ?? "ask"));
  const chatYolo = show("始终批准");
  const chatShortcuts = show("快捷键", shortcutDesc);
  const chatComposer = chatSend || chatSteer;
  const chatSession = chatArchive || chatThinking || chatCompact || chatMemory;
  const chatModelCard = chatModel || chatEffort;
  const chatPerms = chatPermission || chatYolo;
  const chatHas =
    chatComposer || chatSession || chatTelemetry || chatModelCard || chatPerms || chatShortcuts;

  const extensionsHub = show("扩展中心", "技能、MCP、插件、市场和 Hooks 在扩展中心管理。");

  const usageHas = show("用量", "token tokens 消耗 缓存 请求 成本 命中 统计");

  const aboutCli = show("CLI", info?.grokVersion || "未检测到 CLI");
  const aboutLogin = show("登录", "未登录，请在终端运行 grok login");
  const aboutConfig = show("config.toml") && !!cli?.configPath;
  const aboutUpdate = show("更新", UPDATE_INSTALLATION_COPY);
  const aboutManaged = show("managed_config");
  const aboutMeta = aboutCli || aboutLogin;
  const aboutInstall = aboutConfig || aboutUpdate;
  const aboutHas = aboutMeta || aboutInstall || aboutManaged;

  const emptyCopy = <p className="float-empty">没有匹配的设置</p>;

  return (
    <div className="settings">
      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t(locale, "settings.title")}>
          <div className="search-field">
            <IconGrokSearch size={16} className="search-icon" />
            <input
              type="search"
              className="search"
              value={settingsQuery}
              onChange={(e) => setSettingsQuery(e.target.value)}
              placeholder="搜索设置"
              aria-label="搜索设置"
            />
          </div>
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "active" : undefined}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="settings-pane">
          {tab === "overview" && (
            <section className="set-block">
              <h3>{t(locale, "settings.overview")}</h3>
              {searching && !overviewHas ? emptyCopy : (
                <>
                  {overviewHealth ? (
                    <div className="set-card">
                      <div className="health-list">
                        {overviewCli ? (
                          <div className="set-row">
                            <label>{t(locale, "health.cli")}</label>
                            <p>{info?.grokVersion || "未检测到"}</p>
                          </div>
                        ) : null}
                        {overviewLogin ? (
                          <div className="set-row">
                            <label>{t(locale, "health.login")}</label>
                            <p>{info?.authPresent ? "已登录" : "未登录"}</p>
                          </div>
                        ) : null}
                        {overviewInspect ? (
                          <div className="set-row">
                            <label>{t(locale, "health.inspect")}</label>
                            <p>{skillCount} 技能 · {pluginCount} 插件 · {hookCount} hooks</p>
                          </div>
                        ) : null}
                        {overviewMcp ? (
                          <div className="set-row">
                            <label>MCP</label>
                            <p>{mcpCount} 已启用</p>
                          </div>
                        ) : null}
                        {doctorNote ? <p className="hint">{doctorNote}</p> : null}
                        {overviewAgent ? (
                          <div className="set-row">
                            <label>Agent</label>
                            <p>
                              {agentReady ? "已连接" : agentConnecting ? "连接中" : agentDisconnected ? "已断开" : "未连接"}
                            </p>
                          </div>
                        ) : null}
                        {overviewAgent && agentDisconnected && onRestartAgent ? (
                          <div className="set-actions">
                            <button type="button" className="btn primary" onClick={onRestartAgent}>重启 grok</button>
                          </div>
                        ) : null}
                        <p className="hint">本地诊断可在终端运行 grok inspect。</p>
                      </div>
                      <div className="set-actions">
                        <button type="button" className="btn primary" onClick={() => onOpenHub?.("mcp")}>
                          {t(locale, "hub.title")}
                        </button>
                        <button type="button" className="btn ghost" onClick={() => onRefreshHealth?.()}>
                          刷新健康
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {overviewInbox ? (
                    <div className="set-card">
                      <div className="set-stack">
                        <label>独立对话</label>
                        <p className="hub-meta">{inboxCwd || "尚未设置"}</p>
                      </div>
                      <div className="set-actions">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            void (async () => {
                              const dir = await pickDirectory();
                              if (!dir) return;
                              try {
                                const next = await ensureInbox(dir);
                                onInboxCwd(next);
                                setNote("已记下收件箱目录");
                              } catch (e) {
                                setNote(String(e));
                              }
                            })();
                          }}
                        >
                          选择目录
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => {
                            void (async () => {
                              try {
                                const next = await ensureInbox(null);
                                onInboxCwd(next);
                                setNote("已恢复默认收件箱");
                              } catch (e) {
                                setNote(String(e));
                              }
                            })();
                          }}
                        >
                          恢复默认
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </section>
          )}

          {tab === "appearance" && (
            <section className="set-block">
              <h3>{t(locale, "settings.appearance")}</h3>
              {searching && !appearanceHas ? emptyCopy : (
                <>
                  {appearanceTheme ? (
                    <div className="set-card">
                      {appearanceDark ? (
                        <div className="set-row">
                          <div>
                            <label>深色模式</label>
                          </div>
                          <button type="button" className={`toggle ${theme === "dark" ? "on" : ""}`} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
                            <i />
                          </button>
                        </div>
                      ) : null}
                      {appearanceFamily ? (
                        <div className="set-stack">
                          <label>主题族</label>
                          <MenuSelect
                            ariaLabel="主题族"
                            value={themeFamily}
                            options={[
                              { value: "default", label: "默认" },
                              { value: "paper", label: "Paper", hint: "暖纸" },
                              { value: "ink", label: "Ink", hint: "高对比" },
                            ]}
                            onChange={(v) => onThemeFamily?.(v as "default" | "paper" | "ink")}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {appearanceLayout ? (
                    <div className="set-card">
                      {appearanceDensity ? (
                        <div className="set-stack">
                          <label>密度</label>
                          <MenuSelect
                            ariaLabel="密度"
                            value={density}
                            options={[
                              { value: "comfortable", label: "舒适" },
                              { value: "compact", label: "紧凑" },
                            ]}
                            onChange={(v) => onDensity?.(v as "comfortable" | "compact")}
                          />
                        </div>
                      ) : null}
                      {appearanceWidth ? (
                        <div className="set-stack">
                          <label>对话宽度 {chatWidth}px</label>
                          <input type="range" min={520} max={920} step={20} value={chatWidth} onChange={(e) => setChatWidth(Number(e.target.value))} />
                        </div>
                      ) : null}
                      {appearanceFont ? (
                        <div className="set-stack">
                          <label>正文字号 {chatFontSize}px</label>
                          <input type="range" min={14} max={20} step={1} value={chatFontSize} onChange={(e) => setChatFontSize(Number(e.target.value))} />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {appearanceLocale ? (
                    <div className="set-card">
                      <div className="set-stack">
                        <label>界面语言</label>
                        <MenuSelect
                          ariaLabel="界面语言"
                          value={locale}
                          options={[
                            { value: "zh", label: "中文" },
                            { value: "en", label: "English" },
                          ]}
                          onChange={(v) => onLocale?.(v as Locale)}
                        />
                      </div>
                    </div>
                  ) : null}
                  {appearanceRail ? (
                    <div className="set-card">
                      <div className="set-stack">
                        <label>审阅默认标签</label>
                        <MenuSelect
                          ariaLabel="审阅默认标签"
                          value={defaultRail}
                          options={[
                            { value: "tasks", label: "进度" },
                            { value: "changes", label: "改动" },
                          ]}
                          onChange={(v) => onDefaultRail?.(v as "tasks" | "changes" | "context")}
                        />
                      </div>
                    </div>
                  ) : null}
                  {appearanceTray ? (
                    <div className="set-card">
                      <div className="set-row">
                        <label>关闭窗口进托盘</label>
                        <button type="button" className={`toggle ${hideToTray ? "on" : ""}`} onClick={() => onHideToTray?.(!hideToTray)}>
                          <i />
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </section>
          )}

          {tab === "chat" && (
            <section className="set-block">
              <h3>{t(locale, "settings.chat")}</h3>
              {searching && !chatHas ? emptyCopy : (
                <>
                  {chatComposer ? (
                    <div className="set-card">
                      {chatSend ? (
                        <div className="set-stack">
                          <label id="set-send-key">发送快捷键</label>
                          <MenuSelect
                            ariaLabel="发送快捷键"
                            value={enterSendsOn ? "enter" : "mod"}
                            options={[
                              { value: "enter", label: "Enter 发送" },
                              { value: "mod", label: "⌘/Ctrl+Enter 发送" },
                            ]}
                            disabled={!onEnterSends}
                            onChange={(next) => onEnterSends?.(next === "enter")}
                          />
                        </div>
                      ) : null}
                      {chatSteer ? (
                        <div className="set-stack">
                          <label>中途改向</label>
                          <MenuSelect
                            ariaLabel="中途改向默认行为"
                            value={steerByDefault ? "steer" : "queue"}
                            options={[
                              { value: "queue", label: "排队到轮末", hint: "默认。不打断正在跑的这一轮" },
                              { value: "steer", label: "立即改向", hint: "把消息注入当前轮，不丢已完成的工具调用" },
                            ]}
                            disabled={!onSteerByDefault}
                            onChange={(next) => onSteerByDefault?.(next === "steer")}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {chatSession ? (
                    <div className="set-card">
                      {chatArchive ? (
                        <div className="set-stack">
                          <label>自动归档（天）</label>
                          <MenuSelect
                            ariaLabel="自动归档天数"
                            value={String(archiveDays)}
                            options={[
                              { value: "0", label: "关闭" },
                              { value: "7", label: "7 天" },
                              { value: "14", label: "14 天" },
                              { value: "30", label: "30 天" },
                            ]}
                            disabled={!onAutoArchiveDays}
                            onChange={(next) => onAutoArchiveDays?.(Number(next))}
                          />
                        </div>
                      ) : null}
                      {chatThinking ? (
                        <div className="set-row">
                          <label>显示思考过程</label>
                          <button type="button" className={`toggle ${cli?.showThinking ? "on" : ""}`} onClick={() => void patch({ showThinking: !cli?.showThinking })}>
                            <i />
                          </button>
                        </div>
                      ) : null}
                      {chatCompact ? (
                        <div className="set-stack">
                          <label>自动压缩阈值 {cli?.compactPercent ?? 85}%</label>
                          <input
                            type="range"
                            min={50}
                            max={95}
                            value={cli?.compactPercent ?? 85}
                            onChange={(e) => void patch({ compactPercent: Number(e.target.value) })}
                          />
                        </div>
                      ) : null}
                      {chatMemory ? (
                        <div className="set-row">
                          <label>跨会话记忆</label>
                          <button type="button" className={`toggle ${cli?.memory ? "on" : ""}`} onClick={() => void patch({ memory: !cli?.memory })}>
                            <i />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {chatTelemetry ? (
                    <div className="set-card">
                      <div className="set-row">
                        <label>匿名遥测</label>
                        <button type="button" className={`toggle ${cli?.telemetry ? "on" : ""}`} onClick={() => void patch({ telemetry: !cli?.telemetry })}>
                          <i />
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {chatModelCard ? (
                    <div className="set-card">
                      {chatModel ? (
                        <div className="set-stack">
                          <label>默认模型</label>
                          <input
                            defaultValue={cli?.model ?? ""}
                            key={cli?.model}
                            onBlur={(e) => {
                              if (e.target.value && e.target.value !== cli?.model) void patch({ model: e.target.value });
                            }}
                          />
                        </div>
                      ) : null}
                      {chatEffort ? (
                        <div className="set-stack">
                          <label>推理力度</label>
                          <MenuSelect
                            ariaLabel="推理力度"
                            value={normalizeEffort(cli?.effort)}
                            options={EFFORT_OPTIONS.map((o) => ({ value: o.id, label: o.label, hint: o.hint }))}
                            onChange={(next) => void patch({ effort: next })}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {chatPerms ? (
                    <div className="set-card">
                      {chatPermission ? (
                        <>
                          <div className="set-stack">
                            <label>许可模式</label>
                            <MenuSelect
                              ariaLabel="许可模式"
                              value={cli?.permissionMode ?? "ask"}
                              options={[
                                { value: "ask", label: "ask", hint: permissionModeHint("ask") },
                                { value: "always-approve", label: "always-approve", hint: permissionModeHint("always-approve") },
                                { value: "auto", label: "auto", hint: permissionModeHint("auto") },
                              ]}
                              onChange={(next) => {
                                if ((next === "always-approve" || next === "auto") && cli?.permissionMode === "ask") {
                                  if (!window.confirm("切到始终批准 / 全权限会跳过逐条许可。确定？")) return;
                                }
                                void patch({ permissionMode: next });
                              }}
                            />
                          </div>
                          <p className="hint">{permissionModeHint(cli?.permissionMode ?? "ask")} {stateAuthorityExplanation("permissionMode")}。</p>
                        </>
                      ) : null}
                      {chatYolo ? (
                        <div className="set-row">
                          <label>始终批准</label>
                          <button type="button" className={`toggle ${cli?.yolo ? "on" : ""}`} onClick={() => {
                            if (!cli?.yolo && !window.confirm("始终批准会跳过许可卡。确定？")) return;
                            void patch({ yolo: !cli?.yolo });
                          }}>
                            <i />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {chatShortcuts ? (
                    <div className="set-card" id="settings-shortcuts">
                      <div className="set-stack">
                        <label>快捷键</label>
                      </div>
                      <ShortcutsTable
                        overrides={shortcuts ?? {}}
                        onChange={(id, binding) => onShortcut?.(id, binding)}
                      />
                    </div>
                  ) : null}
                </>
              )}
            </section>
          )}

          {tab === "extensions" && (
            <section className="set-block">
              <h3>{t(locale, "settings.extensions")}</h3>
              {searching && !extensionsHub ? emptyCopy : extensionsHub ? (
                <div className="set-card">
                  <p className="hub-meta">技能、MCP、插件、市场和 Hooks 在扩展中心管理。</p>
                  <div className="set-actions">
                    <button type="button" className="btn primary" onClick={() => onOpenHub?.("skills")}>
                      打开扩展中心
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          )}

          {tab === "usage" && (
            <section className="set-block">
              <h3>{t(locale, "settings.usage")}</h3>
              {searching && !usageHas ? emptyCopy : <UsageStats />}
            </section>
          )}

          {tab === "about" && (
            <section className="set-block">
              <h3>{t(locale, "settings.about")}</h3>
              {searching && !aboutHas ? emptyCopy : (
                <>
                  {aboutMeta ? (
                    <div className="set-card">
                      {aboutCli ? (
                        <>
                          <p className="meta-line">{info?.grokVersion || "未检测到 CLI"}</p>
                          {info?.grokPath && <p className="hub-meta">{info.grokPath}</p>}
                        </>
                      ) : null}
                      {aboutLogin ? (
                        <p className="meta-line">{info?.authPresent ? "已登录" : "未登录，请在终端运行 grok login"}</p>
                      ) : null}
                    </div>
                  ) : null}
                  {aboutInstall ? (
                    <div className="set-card">
                      {aboutConfig ? (
                        <div className="set-actions">
                          <button type="button" className="btn ghost" onClick={() => void openPath(cli.configPath)}>打开 config.toml</button>
                        </div>
                      ) : null}
                      {aboutUpdate ? <p className="hint">{UPDATE_INSTALLATION_COPY}</p> : null}
                    </div>
                  ) : null}
                  {aboutManaged ? (
                    <div className="set-card">
                      <ManagedConfigView
                        path={managedPath || "~/.grok/managed_config"}
                        text={managedText || ""}
                        exists={!!managedText}
                      />
                    </div>
                  ) : null}
                </>
              )}
            </section>
          )}
        </div>
      </div>

      {note && <p className="set-note">{busy ? "写入中…" : note}</p>}
    </div>
  );
}
