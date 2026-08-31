import { useEffect, useState } from "react";
import {
  ensureInbox,
  openPath,
  patchCliSettings,
  pickDirectory,
  trustFolder,
  type CliSettings,
  type DoctorInfo,
} from "./api";
import { DoctorsOverview } from "./components/DoctorsOverview";
import { MenuSelect } from "./components/MenuSelect";
import { dangerCaption, tapDanger, type ConfirmState } from "./lib/confirm";
import { EFFORT_OPTIONS, normalizeEffort } from "./lib/effort";
import { CHAT_FONT_PRESETS, normalizeChatFontSize } from "./lib/chat-font";
import { CHAT_WIDTH_PRESETS, normalizeChatWidth } from "./lib/chat-width";
import { isDangerousTrustPath, localeSearchHay, LOCALE_CHOICES, t, type Locale } from "./lib/i18n";
import { permissionModeHint } from "./lib/permission-copy";
import { UPDATE_INSTALLATION_COPY } from "./lib/product-copy";
import { stateAuthorityExplanation } from "./lib/state-authority";
import { settingRowVisible } from "./lib/settings-search";
import { ShortcutsTable } from "./components/ShortcutsTable";
import { ManagedConfigView } from "./components/ManagedConfigView";
import { AppModal } from "./components/AppModal";
import { UsageStats } from "./components/UsageStats";
import { DEFAULT_SHORTCUTS } from "./lib/shortcuts-table";
import type { HubTab } from "./lib/commands";
import type { InspectReport } from "./lib/inspect";
import { enabledMcpCount } from "./lib/inspect";
import { IconGrokSearch } from "./grok-icons";
import { agentChipLabel } from "./lib/agent-chip";
import { isAgentId } from "./lib/agent-id";
import type { AgentDoctor } from "./lib/agent-doctor";
import { DEFAULT_MEMORY_SETTINGS } from "./lib/memory-settings";
import { nextDreamAgent } from "./lib/memory-settings-ui";
import { doctorAll } from "./lib/workbench-api";

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
  injectUserMemory?: boolean;
  onInjectUserMemory?: (v: boolean) => void;
  dreamingEnabled?: boolean;
  onDreamingEnabled?: (v: boolean) => void;
  dreamAgentId?: string;
  onDreamAgentId?: (id: string) => void;
  dreamAgentOptions?: { id: string; label: string }[];
  locale?: Locale;
  onLocale?: (l: Locale) => void;
  themeFamily?: "default" | "paper" | "ink";
  onThemeFamily?: (f: "default" | "paper" | "ink") => void;
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

function ChoiceSwitch({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: number;
  options: { value: number; label: string }[];
  onChange: (v: number) => void;
  ariaLabel: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      className="choice-switch"
      role="radiogroup"
      aria-label={ariaLabel}
      style={{
        ["--choice-n" as string]: options.length,
        ["--choice-i" as string]: index,
      }}
    >
      <span className="choice-switch-thumb" aria-hidden />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? "on" : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

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
  injectUserMemory = DEFAULT_MEMORY_SETTINGS.injectUserMemory,
  onInjectUserMemory,
  dreamingEnabled = DEFAULT_MEMORY_SETTINGS.dreamingEnabled,
  onDreamingEnabled,
  dreamAgentId = DEFAULT_MEMORY_SETTINGS.dreamAgentId,
  onDreamAgentId,
  dreamAgentOptions,
  locale = "zh",
  onLocale,
  themeFamily = "default",
  onThemeFamily,
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
  const [confirm, setConfirm] = useState<{
    title: string;
    body: string;
    confirmLabel: string;
    run: () => void;
  } | null>(null);
  const [trustConfirm, setTrustConfirm] = useState<ConfirmState | null>(null);
  const [doctors, setDoctors] = useState<AgentDoctor[]>([]);

  useEffect(() => {
    void doctorAll().then(setDoctors).catch(() => setDoctors([]));
  }, []);

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
  const pickerOptions = dreamAgentOptions ?? doctors.filter((d) => d.authPresent).map((d) => ({
    id: d.agentId,
    label: agentChipLabel(d.agentId),
  }));
  const loggedInDreamAgents = pickerOptions.map((o) => o.id).filter(isAgentId);
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
  const hay = (key: string, extra = "") => localeSearchHay(key, extra);
  const searching = settingsQuery.trim().length > 0;

  const overviewCli = show(t(locale, "health.cli"));
  const overviewLogin = show(t(locale, "health.login"));
  const overviewInspect = show(t(locale, "health.inspect"));
  const overviewMcp = show("MCP");
  const overviewAgent = show("Agent");
  const overviewInbox = show("独立对话", "收件箱目录");
  const overviewHealth = overviewCli || overviewLogin || overviewInspect || overviewMcp || overviewAgent;
  const overviewHas = overviewHealth || overviewInbox;

  const appearanceDark = show(hay("settings.dark"));
  const appearanceFamily = show(hay("settings.themeFamily"), "默认 Paper 暖纸 Ink 高对比 Default Warm High contrast");
  const appearanceLocale = show(hay("settings.locale"), "简体中文 English 中文");
  const appearanceWidth = show(hay("settings.chatWidth"), "窄 中 宽 填充 Narrow Medium Wide Fill");
  const appearanceFont = show(hay("settings.fontSize"), "较小 中 常规 Smaller Medium Regular 14 15 17");
  const appearanceRail = show(hay("settings.defaultRail"), "Dashboard 审阅");
  const appearanceTray = show(hay("settings.hideToTray"));
  const appearanceTheme = appearanceDark || appearanceFamily;
  const appearanceLayout = appearanceWidth || appearanceFont;
  const appearanceHas =
    appearanceTheme || appearanceLayout || appearanceLocale || appearanceRail || appearanceTray;

  const sendDesc = "Enter 发送或 ⌘Enter Enter send";
  const steerDesc = "排队到轮末或不打断正在跑的这一轮 立即改向 Queue steer";
  const shortcutDesc = DEFAULT_SHORTCUTS.map((row) => `${row.action} ${row.defaultBinding}`).join(" ");
  const chatSend = show(hay("settings.sendKey"), sendDesc);
  const chatSteer = show(hay("settings.steer"), steerDesc);
  const chatArchive = show(hay("settings.archive"));
  const chatThinking = show(hay("settings.thinking"));
  const chatCompact = show(hay("settings.compact"));
  const chatMemory = show(
    hay("settings.memory"),
    [
      t("zh", "settings.injectUserMemory"),
      t("en", "settings.injectUserMemory"),
      t("zh", "settings.dreamingEnabled"),
      t("en", "settings.dreamingEnabled"),
      t("zh", "settings.dreamAgentId"),
      t("en", "settings.dreamAgentId"),
    ].join(" "),
  );
  const chatTelemetry = show(hay("settings.telemetry"));
  const chatModel = show(hay("settings.model"));
  const chatEffort = show(hay("settings.effort"));
  const chatPermission = show(hay("settings.permission"), permissionModeHint(cli?.permissionMode ?? "ask", locale));
  const chatYolo = show(hay("settings.yolo"));
  const chatShortcuts = show(hay("settings.shortcuts"), shortcutDesc);
  const chatComposer = chatSend || chatSteer;
  const chatSession = chatArchive || chatThinking || chatCompact || chatMemory;
  const chatModelCard = chatModel || chatEffort;
  const chatPerms = chatPermission || chatYolo;
  const chatHas =
    chatComposer || chatSession || chatTelemetry || chatModelCard || chatPerms || chatShortcuts;

  const extensionsHub = show(hay("hub.title"), "技能、MCP、插件、市场和 Hooks Skills plugins marketplace");

  const usageHas = show(hay("settings.usage"), "token tokens 消耗 缓存 请求 成本 命中 统计");

  const aboutCli = show(hay("health.cli"), info?.grokVersion || "未检测到 CLI");
  const aboutLogin = show(hay("health.login"), "未登录，请在终端运行 grok login Not signed in");
  const aboutConfig = show("config.toml") && !!cli?.configPath;
  const aboutUpdate = show("更新", UPDATE_INSTALLATION_COPY);
  const aboutManaged = show("managed_config");
  const aboutMeta = aboutCli || aboutLogin;
  const aboutInstall = aboutConfig || aboutUpdate;
  const aboutHas = aboutMeta || aboutInstall || aboutManaged;

  const emptyCopy = <p className="float-empty">{t(locale, "settings.empty")}</p>;
  const trustCwd = inspect?.cwd ?? "";
  const showTrust = inspect?.projectTrusted === false && !!trustCwd;
  const trustId = `trust:${trustCwd}`;

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
              placeholder={t(locale, "settings.search")}
              aria-label={t(locale, "settings.search")}
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

        <div className="settings-pane pane-in" key={tab}>
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
                        <DoctorsOverview doctors={doctors} onCopied={() => setNote(t(locale, "toast.copied"))} />
                        {overviewAgent ? (
                          <div className="set-row">
                            <label>Agent</label>
                            <p>
                              <span
                                className={`conn-chip${agentReady ? " ready" : agentConnecting ? " connecting" : ""}`}
                              >
                                {agentReady ? "已连接" : agentConnecting ? "连接中" : agentDisconnected ? "已断开" : "未连接"}
                              </span>
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
                  {showTrust ? (
                    <div className="set-card">
                      <div className="set-stack">
                        <p className="hub-meta">{t(locale, "trust.banner")}</p>
                        {isDangerousTrustPath(trustCwd) ? (
                          <p className="hint">{t(locale, "trust.danger")}</p>
                        ) : null}
                      </div>
                      <div className="set-actions">
                        <button
                          type="button"
                          className="btn primary"
                          onClick={() => {
                            const { confirmed, next } = tapDanger(trustConfirm, trustId, Date.now());
                            setTrustConfirm(next);
                            if (!confirmed) return;
                            void (async () => {
                              try {
                                await trustFolder(trustCwd, true);
                                onRefreshHealth?.();
                                setNote(t(locale, "trust.done"));
                              } catch (e) {
                                setNote(String(e));
                              }
                            })();
                          }}
                        >
                          {dangerCaption(
                            trustConfirm,
                            trustId,
                            t(locale, "trust.action"),
                            t(locale, "hub.confirmAgain"),
                          )}
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
                            <label>{t(locale, "settings.dark")}</label>
                          </div>
                          <button type="button" className={`toggle ${theme === "dark" ? "on" : ""}`} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
                            <i />
                          </button>
                        </div>
                      ) : null}
                      {appearanceFamily ? (
                        <div className="set-stack">
                          <label>{t(locale, "settings.themeFamily")}</label>
                          <MenuSelect
                            ariaLabel={t(locale, "settings.themeFamily")}
                            value={themeFamily}
                            options={[
                              { value: "default", label: t(locale, "settings.themeDefault") },
                              { value: "paper", label: "Paper", hint: t(locale, "settings.paperHint") },
                              { value: "ink", label: "Ink", hint: t(locale, "settings.inkHint") },
                            ]}
                            onChange={(v) => onThemeFamily?.(v as "default" | "paper" | "ink")}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {appearanceLayout ? (
                    <div className="set-card">
                      {appearanceWidth ? (
                        <div className="set-stack">
                          <label>{t(locale, "settings.chatWidth")}</label>
                          <ChoiceSwitch
                            value={normalizeChatWidth(chatWidth)}
                            options={CHAT_WIDTH_PRESETS.map((preset) => ({
                              value: preset.px,
                              label: t(locale, preset.labelKey),
                            }))}
                            onChange={setChatWidth}
                            ariaLabel={t(locale, "settings.chatWidth")}
                          />
                        </div>
                      ) : null}
                      {appearanceFont ? (
                        <div className="set-stack">
                          <label>{t(locale, "settings.fontSize")}</label>
                          <div className="locale-switch" role="radiogroup" aria-label={t(locale, "settings.fontSize")}>
                            {CHAT_FONT_PRESETS.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                role="radio"
                                aria-checked={normalizeChatFontSize(chatFontSize) === preset.px}
                                className={normalizeChatFontSize(chatFontSize) === preset.px ? "on" : undefined}
                                onClick={() => setChatFontSize(preset.px)}
                              >
                                {t(locale, preset.labelKey)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {appearanceLocale ? (
                    <div className="set-card">
                      <div className="set-stack">
                        <label>{t(locale, "settings.locale")}</label>
                        <div className="locale-switch" role="radiogroup" aria-label={t(locale, "settings.locale")}>
                          {LOCALE_CHOICES.map((choice) => (
                            <button
                              key={choice.id}
                              type="button"
                              role="radio"
                              aria-checked={locale === choice.id}
                              className={locale === choice.id ? "on" : undefined}
                              onClick={() => onLocale?.(choice.id)}
                            >
                              {choice.native}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {appearanceRail ? (
                    <div className="set-card">
                      <div className="set-stack">
                        <label>{t(locale, "settings.defaultRail")}</label>
                        <MenuSelect
                          ariaLabel={t(locale, "settings.defaultRail")}
                          value={defaultRail}
                          options={[
                            { value: "tasks", label: t(locale, "settings.railProgress") },
                            { value: "changes", label: t(locale, "settings.railChanges") },
                          ]}
                          onChange={(v) => onDefaultRail?.(v as "tasks" | "changes" | "context")}
                        />
                      </div>
                    </div>
                  ) : null}
                  {appearanceTray ? (
                    <div className="set-card">
                      <div className="set-row">
                        <label>{t(locale, "settings.hideToTray")}</label>
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
                          <label id="set-send-key">{t(locale, "settings.sendKey")}</label>
                          <MenuSelect
                            ariaLabel={t(locale, "settings.sendKey")}
                            value={enterSendsOn ? "enter" : "mod"}
                            options={[
                              { value: "enter", label: t(locale, "settings.sendEnter") },
                              { value: "mod", label: t(locale, "settings.sendMod") },
                            ]}
                            disabled={!onEnterSends}
                            onChange={(next) => onEnterSends?.(next === "enter")}
                          />
                        </div>
                      ) : null}
                      {chatSteer ? (
                        <div className="set-stack">
                          <label>{t(locale, "settings.steer")}</label>
                          <MenuSelect
                            ariaLabel={t(locale, "settings.steerDefault")}
                            value={steerByDefault ? "steer" : "queue"}
                            options={[
                              { value: "queue", label: t(locale, "settings.queueEnd"), hint: t(locale, "settings.queueEndHint") },
                              { value: "steer", label: t(locale, "settings.steerNow"), hint: t(locale, "settings.steerNowHint") },
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
                          <label>{t(locale, "settings.archive")}</label>
                          <MenuSelect
                            ariaLabel={t(locale, "settings.archive")}
                            value={String(archiveDays)}
                            options={[
                              { value: "0", label: t(locale, "settings.archiveOff") },
                              { value: "7", label: t(locale, "settings.archiveDays", { n: 7 }) },
                              { value: "14", label: t(locale, "settings.archiveDays", { n: 14 }) },
                              { value: "30", label: t(locale, "settings.archiveDays", { n: 30 }) },
                            ]}
                            disabled={!onAutoArchiveDays}
                            onChange={(next) => onAutoArchiveDays?.(Number(next))}
                          />
                        </div>
                      ) : null}
                      {chatThinking ? (
                        <div className="set-row">
                          <label>{t(locale, "settings.thinking")}</label>
                          <button type="button" className={`toggle ${cli?.showThinking ? "on" : ""}`} onClick={() => void patch({ showThinking: !cli?.showThinking })}>
                            <i />
                          </button>
                        </div>
                      ) : null}
                      {chatCompact ? (
                        <div className="set-stack">
                          <label>{t(locale, "settings.compact")} {cli?.compactPercent ?? 85}%</label>
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
                        <>
                          <div className="set-row">
                            <label>{t(locale, "settings.memory")}</label>
                            <button type="button" className={`toggle ${cli?.memory ? "on" : ""}`} onClick={() => void patch({ memory: !cli?.memory })}>
                              <i />
                            </button>
                          </div>
                          <div className="set-row">
                            <label>{t(locale, "settings.injectUserMemory")}</label>
                            <button
                              type="button"
                              className={`toggle ${injectUserMemory ? "on" : ""}`}
                              disabled={!onInjectUserMemory}
                              onClick={() => onInjectUserMemory?.(!injectUserMemory)}
                            >
                              <i />
                            </button>
                          </div>
                          <div className="set-row">
                            <label>{t(locale, "settings.dreamingEnabled")}</label>
                            <button
                              type="button"
                              className={`toggle ${dreamingEnabled ? "on" : ""}`}
                              disabled={!onDreamingEnabled}
                              onClick={() => onDreamingEnabled?.(!dreamingEnabled)}
                            >
                              <i />
                            </button>
                          </div>
                          <div className="set-stack">
                            <label>{t(locale, "settings.dreamAgentId")}</label>
                            <MenuSelect
                              ariaLabel={t(locale, "settings.dreamAgentId")}
                              value={dreamAgentId}
                              options={pickerOptions.map((o) => ({ value: o.id, label: o.label }))}
                              disabled={!onDreamAgentId}
                              onChange={(next) => {
                                const id = nextDreamAgent(next, loggedInDreamAgents);
                                if (id) onDreamAgentId?.(id);
                              }}
                            />
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {chatTelemetry ? (
                    <div className="set-card">
                      <div className="set-row">
                        <label>{t(locale, "settings.telemetry")}</label>
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
                          <label>{t(locale, "settings.model")}</label>
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
                          <label>{t(locale, "settings.effort")}</label>
                          <MenuSelect
                            ariaLabel={t(locale, "settings.effort")}
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
                            <label>{t(locale, "settings.permission")}</label>
                            <MenuSelect
                              ariaLabel={t(locale, "settings.permission")}
                              value={cli?.permissionMode ?? "ask"}
                              options={[
                                { value: "ask", label: "ask", hint: permissionModeHint("ask", locale) },
                                { value: "always-approve", label: "always-approve", hint: permissionModeHint("always-approve", locale) },
                                { value: "auto", label: "auto", hint: permissionModeHint("auto", locale) },
                              ]}
                              onChange={(next) => {
                                if ((next === "always-approve" || next === "auto") && cli?.permissionMode === "ask") {
                                  setConfirm({
                                    title: t(locale, "settings.permission"),
                                    body: t(locale, "settings.yoloConfirm"),
                                    confirmLabel: t(locale, "settings.ok"),
                                    run: () => void patch({ permissionMode: next }),
                                  });
                                  return;
                                }
                                void patch({ permissionMode: next });
                              }}
                            />
                          </div>
                          <p className="hint">{permissionModeHint(cli?.permissionMode ?? "ask", locale)} {stateAuthorityExplanation("permissionMode")}。</p>
                        </>
                      ) : null}
                      {chatYolo ? (
                        <div className="set-row">
                          <label>{t(locale, "settings.yolo")}</label>
                          <button type="button" className={`toggle ${cli?.yolo ? "on" : ""}`} onClick={() => {
                            if (!cli?.yolo) {
                              setConfirm({
                                title: t(locale, "settings.yolo"),
                                body: t(locale, "composer.yoloHint"),
                                confirmLabel: t(locale, "settings.ok"),
                                run: () => void patch({ yolo: true }),
                              });
                              return;
                            }
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
                        <label>{t(locale, "settings.shortcuts")}</label>
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
                      {t(locale, "settings.openHub")}
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
                          <button type="button" className="btn ghost" onClick={() => void openPath(cli.configPath)}>{t(locale, "settings.openConfig")}</button>
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
      <AppModal
        open={!!confirm}
        title={confirm?.title ?? ""}
        body={confirm?.body ?? ""}
        confirmLabel={confirm?.confirmLabel ?? "确定"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const run = confirm?.run;
          setConfirm(null);
          run?.();
        }}
      />
    </div>
  );
}
