import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createSkill,
  inspectBrief,
  onGrokCliLog,
  openPath,
  patchSkillsDisabled,
  readConfigText,
  readTextFile,
  runGrok,
  trustFolder,
  writeConfigText,
  writeHookFile,
  type GrokRunResult,
} from "../api";
import { MenuSelect } from "./MenuSelect";
import { dangerCaption, isArmed, tapDanger, type ConfirmState } from "../lib/confirm";
import {
  enabledMcpCount,
  groupSkills,
  mcpHealthLabel,
  mcpSourceBadge,
  parseInspect,
  qualifySkillName,
  sourcePath,
  type InspectHook,
  type InspectMcp,
  type InspectReport,
  type InspectSkill,
  type SkillScope,
} from "../lib/inspect";
import { t, type Locale } from "../lib/i18n";
import { IconGrokClose } from "../grok-icons";
import { IconFinder, IconRefresh } from "../icons";
import { hubEmptyKind } from "../lib/hub-empty";
import { HOOK_TEMPLATES } from "../lib/hook-templates";
import { marketplaceJsonHelp } from "../lib/copy-help";
import { POPULAR_MCP, popularMcpAddArgs } from "../lib/popular-mcp";
// compat toggles live in Settings, not here
import {
  grokMarketplaceAdd,
  grokMarketplaceList,
  grokMarketplaceRemove,
  grokMarketplaceUpdate,
  grokMcpAdd,
  grokMcpDisable,
  grokMcpDoctor,
  grokMcpEnable,
  grokMcpList,
  grokMcpRemove,
  grokPluginInstall,
  mcpAddArgv,
  parseJsonList,
  parseJsonObject,
  type McpAddInput,
  type McpScope,
  type McpTransport,
} from "../lib/grok-cli";
import { grokCliNote } from "../lib/grok-note";
import { HUB_TABS, type HubTab } from "../lib/commands";

export type ExtensionsHubProps = {
  open: boolean;
  tab: HubTab;
  onTab: (tab: HubTab) => void;
  onClose: () => void;
  cwd: string;
  locale: Locale;
  onForwardSlash?: (text: string) => void;
};

const TABS = HUB_TABS;
const SCOPE_LABEL: Record<SkillScope, string> = {
  cwd: "当前目录",
  repo: "仓库",
  user: "用户",
  bundled: "内置",
  plugin: "插件",
  compat: "兼容",
};

const HEALTH_ZH: Record<string, string> = {
  Connected: "已连接",
  Failed: "失败",
  Disabled: "已关闭",
  Unknown: "未知",
};

const SOURCE_ZH: Record<string, string> = {
  toml: "用户配置",
  project: "项目",
  plugin: "插件",
  claude: "Claude",
  cursor: "Cursor",
  "mcp.json": "mcp.json",
  other: "其他",
};

type DoctorServer = {
  name: string;
  healthy?: boolean;
  checks?: { label: string; passed: boolean; detail?: string }[];
  tools?: string[];
};

function resultNote(r: GrokRunResult): string | null {
  return grokCliNote(r);
}

export function ExtensionsHub({
  open,
  tab,
  onTab,
  onClose,
  cwd,
  locale,
  onForwardSlash,
}: ExtensionsHubProps) {
  const [report, setReport] = useState<InspectReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [skillPreview, setSkillPreview] = useState<{ path: string; text: string } | null>(null);
  const [disabledSkills, setDisabledSkills] = useState<string[]>([]);
  const [tomlOpen, setTomlOpen] = useState(false);
  const [tomlText, setTomlText] = useState("");
  const [tomlScope, setTomlScope] = useState<"user" | "project">("user");
  const [mcpForm, setMcpForm] = useState<McpAddInput>({
    name: "",
    transport: "stdio",
    commandOrUrl: "",
    args: [],
    env: [],
    headers: [],
    scope: "user",
  });
  const [envDraft, setEnvDraft] = useState("");
  const [headerDraft, setHeaderDraft] = useState("");
  const [marketSource, setMarketSource] = useState("");
  const [installSource, setInstallSource] = useState("");
  const [newSkill, setNewSkill] = useState({ name: "", scope: "user" as "user" | "project", template: "blank" });
  const [mcpList, setMcpList] = useState<{ name: string; enabled?: boolean; scope?: string; url?: string }[]>([]);
  const [doctor, setDoctor] = useState<Record<string, DoctorServer>>({});
  const [marketFailed, setMarketFailed] = useState(false);
  const [marketText, setMarketText] = useState("");
  const [compose, setCompose] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const raw = await inspectBrief(cwd || null);
      const parsed = parseInspect(raw);
      setReport(parsed);
      const listed = await grokMcpList(cwd || null);
      setMcpList(parseJsonList(listed.stdout));
      const doc = await grokMcpDoctor(undefined, cwd || null);
      const obj = parseJsonObject<{ servers?: DoctorServer[] }>(doc.stdout);
      const map: Record<string, DoctorServer> = {};
      for (const s of obj?.servers ?? []) map[s.name] = s;
      setDoctor(map);
      const cfg = await readConfigText("user");
      const disabled = [...cfg.text.matchAll(/disabled\s*=\s*\[([^\]]*)\]/g)]
        .flatMap((m) => m[1].split(",").map((s) => s.replace(/["'\s]/g, "")))
        .filter(Boolean);
      setDisabledSkills(disabled);
      const market = await grokMarketplaceList(cwd || null);
      setMarketFailed((market.code ?? 0) !== 0 && !market.stdout.trim());
      setMarketText(market.stdout || market.stderr);
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  }, [cwd]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    let off: (() => void) | undefined;
    void onGrokCliLog((row) => {
      setLogs((prev) => [...prev.slice(-80), `${row.stream === "stderr" ? "!" : " "} ${row.line}`]);
    }).then((fn) => {
      off = fn;
    });
    return () => off?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const q = query.trim().toLowerCase();
  const skills = useMemo(() => {
    const all = report?.skills ?? [];
    if (!q) return all;
    return all.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q),
    );
  }, [report, q]);
  const mcpServers = useMemo(() => {
    const all = report?.mcpServers ?? [];
    if (!q) return all;
    return all.filter((s) => s.name.toLowerCase().includes(q) || (s.target ?? "").toLowerCase().includes(q));
  }, [report, q]);
  const hooks = report?.hooks ?? [];
  const empty = hubEmptyKind({
    tab,
    query,
    count:
      tab === "skills"
        ? skills.length
        : tab === "mcp"
          ? mcpServers.length
          : tab === "hooks"
            ? hooks.length
            : marketText.trim()
              ? 1
              : 0,
    marketFailed,
  });

  async function runNoted(fn: () => Promise<GrokRunResult | void>) {
    setBusy(true);
    setNote(null);
    try {
      const r = await fn();
      if (r && "code" in r) {
        const msg = resultNote(r);
        if (msg) {
          setNote(msg);
          setShowLog(true);
        } else {
          setNote(null);
        }
      }
      await load();
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  }

  function askDanger(id: string, action: () => void) {
    const { confirmed, next } = tapDanger(confirm, id, Date.now());
    setConfirm(next);
    setNote(null);
    if (confirmed) action();
  }

  if (!open) return null;

  return (
    <div className="settings-layer hub-layer">
      <div className="settings-backdrop" onClick={onClose} />
      <div
        className="settings-dialog hub-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hub-title"
      >
        <div className="settings-head">
          <h2 id="hub-title">{t(locale, "hub.title")}</h2>
          <button type="button" className="icon-btn" aria-label="关闭" onClick={onClose}>
            <IconGrokClose size={16} />
          </button>
        </div>
        <div className="hub-chrome">
          <nav className="hub-nav" role="tablist" aria-label={t(locale, "hub.title")}>
            {TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                className={tab === id ? "active" : undefined}
                aria-selected={tab === id}
                aria-controls={`hub-panel-${id}`}
                id={`hub-tab-${id}`}
                onClick={() => {
                  setCompose(false);
                  onTab(id);
                }}
              >
                {t(locale, `hub.${id === "marketplace" ? "marketplace" : id}`)}
              </button>
            ))}
          </nav>
          <input
            className="hub-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索"
            aria-label="搜索扩展"
          />
          <button type="button" className="icon-btn" onClick={() => void load()} disabled={busy} title="刷新" aria-label="刷新">
            <IconRefresh size={16} />
          </button>
        </div>
        {report && report.projectTrusted === false && cwd ? (
          <div className="trust-banner" role="status">
            <span>{t(locale, "trust.banner")}</span>
            <button
              type="button"
              className="btn primary"
              onClick={() => void runNoted(async () => { await trustFolder(cwd, true); })}
            >
              {t(locale, "trust.action")}
            </button>
          </div>
        ) : null}
        <div className="hub-body" role="tabpanel" id={`hub-panel-${tab}`} aria-labelledby={`hub-tab-${tab}`}>
          {tab === "skills" && (
            <SkillsTab
              locale={locale}
              cwd={cwd}
              skills={skills}
              empty={empty}
              disabled={disabledSkills}
              preview={skillPreview}
              compose={compose}
              setCompose={setCompose}
              newSkill={newSkill}
              setNewSkill={setNewSkill}
              onPreview={async (skill) => {
                const path = sourcePath(skill.source);
                if (!path) return;
                try {
                  const file = await readTextFile(path);
                  setSkillPreview({ path: file.path, text: file.text });
                } catch (e) {
                  setNote(String(e));
                }
              }}
              onToggle={(name, off) => {
                const next = off
                  ? Array.from(new Set([...disabledSkills, name]))
                  : disabledSkills.filter((n) => n !== name);
                setDisabledSkills(next);
                void runNoted(async () => { await patchSkillsDisabled(next); });
              }}
              onCreate={() =>
                void runNoted(async () => {
                  await createSkill({
                    name: newSkill.name,
                    scope: newSkill.scope,
                    cwd: cwd || null,
                    template: newSkill.template,
                  });
                })
              }
              onCreateSlash={() => onForwardSlash?.("/create-skill")}
            />
          )}
          {tab === "mcp" && (
            <McpTab
              locale={locale}
              cwd={cwd}
              servers={mcpServers}
              listed={mcpList}
              doctor={doctor}
              empty={empty}
              form={mcpForm}
              setForm={setMcpForm}
              envDraft={envDraft}
              setEnvDraft={setEnvDraft}
              headerDraft={headerDraft}
              setHeaderDraft={setHeaderDraft}
              tomlOpen={tomlOpen}
              setTomlOpen={setTomlOpen}
              tomlText={tomlText}
              setTomlText={setTomlText}
              tomlScope={tomlScope}
              setTomlScope={setTomlScope}
              onLoadToml={async (scope) => {
                const file = await readConfigText(scope, cwd || null);
                setTomlText(file.text);
                setTomlScope(scope);
                setTomlOpen(true);
              }}
              onSaveToml={() =>
                void runNoted(async () => {
                  await writeConfigText(tomlScope, tomlText, cwd || null);
                })
              }
              onAdd={() =>
                void runNoted(() =>
                  grokMcpAdd(
                    {
                      ...mcpForm,
                      env: envDraft.split("\n").map((s) => s.trim()).filter(Boolean),
                      headers: headerDraft.split("\n").map((s) => s.trim()).filter(Boolean),
                      args: mcpForm.args,
                    },
                    cwd || null,
                  ),
                )
              }
              onToggle={(name, enabled) =>
                void runNoted(() => (enabled ? grokMcpDisable(name, cwd || null) : grokMcpEnable(name, cwd || null)))
              }
              onRemove={(name, scope) =>
                askDanger(`mcp-rm:${name}`, () => void runNoted(() => grokMcpRemove(name, scope, cwd || null)))
              }
              confirm={confirm}
              onOauth={(name) => void runNoted(() => grokMcpDoctor(name, cwd || null))}
              onPopular={(preset) =>
                void runNoted(() => runGrok(popularMcpAddArgs(preset, cwd ? [cwd] : []), cwd || null))
              }
              compose={compose}
              setCompose={setCompose}
            />
          )}
          {tab === "marketplace" && (
            <MarketTab
              empty={empty}
              source={marketSource}
              setSource={setMarketSource}
              installSource={installSource}
              setInstallSource={setInstallSource}
              listing={marketText}
              onAdd={() => void runNoted(() => grokMarketplaceAdd(marketSource, cwd || null))}
              onUpdate={() => void runNoted(() => grokMarketplaceUpdate(undefined, cwd || null))}
              onRemove={() =>
                askDanger("market-rm", () => void runNoted(() => grokMarketplaceRemove(marketSource, cwd || null)))
              }
              onInstall={(trust) =>
                void runNoted(() => grokPluginInstall(installSource, trust, cwd || null))
              }
              confirm={confirm}
            />
          )}
          {tab === "hooks" && (
            <HooksTab
              locale={locale}
              cwd={cwd}
              hooks={hooks}
              trusted={report?.projectTrusted !== false}
              onTrust={() => void runNoted(async () => { await trustFolder(cwd, true); })}
              onTemplate={(tpl) =>
                void runNoted(async () => {
                  await writeHookFile("user", tpl.filename, tpl.json, cwd || null);
                })
              }
            />
          )}
          {logs.length > 0 && (
            <div className="hub-compose">
              <button type="button" className="hub-compose-toggle" onClick={() => setShowLog((v) => !v)}>
                {showLog ? "收起日志" : `命令日志 · ${logs.length}`}
              </button>
              {showLog ? (
                <pre className="hub-log" aria-live="polite">
                  {logs.join("\n")}
                </pre>
              ) : null}
            </div>
          )}
          {note && <p className="set-note">{busy ? "处理中…" : note}</p>}
        </div>
      </div>
    </div>
  );
}

function EmptyLine({ kind }: { kind: ReturnType<typeof hubEmptyKind> }) {
  if (!kind) return null;
  const copy: Record<string, string> = {
    skills: "还没有技能。用下方新建，或把 /create-skill 发给 agent。",
    mcp: "还没有 MCP。用添加向导或一键常用服务器。",
    plugins: "还没有已装插件。到市场安装。",
    market: "还没有市场源。在下方添加 git / GitHub / 本地路径。",
    "market-fail": "市场列表刷新失败。检查源地址后点刷新。",
    search: "没有匹配的结果。清空搜索，或换一个词。",
  };
  return <p className="float-empty">{copy[kind]}</p>;
}

function SkillsTab({
  locale,
  cwd,
  skills,
  empty,
  disabled,
  preview,
  compose,
  setCompose,
  newSkill,
  setNewSkill,
  onPreview,
  onToggle,
  onCreate,
  onCreateSlash,
}: {
  locale: Locale;
  cwd: string;
  skills: InspectSkill[];
  empty: ReturnType<typeof hubEmptyKind>;
  disabled: string[];
  preview: { path: string; text: string } | null;
  compose: boolean;
  setCompose: (v: boolean) => void;
  newSkill: { name: string; scope: "user" | "project"; template: string };
  setNewSkill: (n: { name: string; scope: "user" | "project"; template: string }) => void;
  onPreview: (s: InspectSkill) => void;
  onToggle: (name: string, disable: boolean) => void;
  onCreate: () => void;
  onCreateSlash: () => void;
}) {
  const groups = groupSkills(skills, cwd);
  return (
    <>
      <h3>技能 · {skills.length}</h3>
      <EmptyLine kind={empty} />
      {groups.map((g) => (
        <div key={g.scope} className="hub-group">
          <div className="hub-group-label">{SCOPE_LABEL[g.scope]}</div>
          <ul className="hub-rows">
            {g.items.map((skill) => {
              const qname = qualifySkillName(skill, skills);
              const off = disabled.includes(skill.name) || skill.disabled;
              const bits = [
                skill.description,
                skill.userInvocable === false ? "不出现在斜杠" : null,
                qname !== skill.name ? `斜杠 /${qname}` : null,
              ].filter(Boolean);
              return (
                <li key={`${skill.name}:${sourcePath(skill.source)}`} className="hub-row">
                  <button type="button" className="hub-row-main" onClick={() => onPreview(skill)}>
                    <strong>/{skill.name}</strong>
                    {bits.length > 0 ? <span className="hub-meta">{bits.join(" · ")}</span> : null}
                  </button>
                  <button
                    type="button"
                    className={`toggle ${off ? "" : "on"}`}
                    aria-label={off ? t(locale, "hub.enable") : t(locale, "hub.disable")}
                    onClick={() => onToggle(skill.name, !off)}
                  >
                    <i />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {preview && (
        <div className="hub-compose">
          <p className="hub-meta">{preview.path}</p>
          <pre className="hub-preview">{preview.text.slice(0, 8000)}</pre>
          <button type="button" className="file-open" onClick={() => void openPath(preview.path)} title="在访达打开" aria-label="在访达打开">
            <IconFinder size={14} />
          </button>
        </div>
      )}
      <div className="hub-compose">
        <button type="button" className="hub-compose-toggle" onClick={() => setCompose(!compose)}>
          {compose ? "收起新建" : "新建技能"}
        </button>
        {compose ? (
          <>
        <div className="set-stack">
          <label>名称</label>
          <input value={newSkill.name} onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })} />
        </div>
        <div className="set-stack">
          <label>范围</label>
          <MenuSelect
            ariaLabel="技能范围"
            value={newSkill.scope}
            options={[
              { value: "user", label: "用户 ~/.grok/skills" },
              { value: "project", label: "项目 .grok/skills", hint: cwd || "需要工作目录" },
            ]}
            onChange={(v) => setNewSkill({ ...newSkill, scope: v as "user" | "project" })}
          />
        </div>
        <div className="set-stack">
          <label>模板</label>
          <MenuSelect
            ariaLabel="技能模板"
            value={newSkill.template}
            options={[
              { value: "blank", label: "空白" },
              { value: "review", label: "Review" },
              { value: "commit", label: "Commit" },
            ]}
            onChange={(v) => setNewSkill({ ...newSkill, template: v })}
          />
        </div>
        <div className="set-actions">
          <button type="button" className="btn primary" onClick={onCreate} disabled={!newSkill.name.trim()}>
            写入 SKILL.md
          </button>
          <button type="button" className="btn ghost" onClick={onCreateSlash}>
            交给 /create-skill
          </button>
        </div>
          </>
        ) : null}
      </div>
    </>
  );
}

function McpTab({
  locale,
  cwd,
  servers,
  listed,
  doctor,
  empty,
  form,
  setForm,
  envDraft,
  setEnvDraft,
  headerDraft,
  setHeaderDraft,
  tomlOpen,
  setTomlOpen,
  tomlText,
  setTomlText,
  tomlScope,
  setTomlScope,
  onLoadToml,
  onSaveToml,
  onAdd,
  onToggle,
  onRemove,
  onOauth,
  onPopular,
  compose,
  setCompose,
  confirm,
}: {
  locale: Locale;
  cwd: string;
  servers: InspectMcp[];
  listed: { name: string; enabled?: boolean; scope?: string; url?: string }[];
  doctor: Record<string, DoctorServer>;
  empty: ReturnType<typeof hubEmptyKind>;
  form: McpAddInput;
  setForm: (f: McpAddInput) => void;
  envDraft: string;
  setEnvDraft: (s: string) => void;
  headerDraft: string;
  setHeaderDraft: (s: string) => void;
  tomlOpen: boolean;
  setTomlOpen: (v: boolean) => void;
  tomlText: string;
  setTomlText: (s: string) => void;
  tomlScope: "user" | "project";
  setTomlScope: (s: "user" | "project") => void;
  onLoadToml: (scope: "user" | "project") => void;
  onSaveToml: () => void;
  onAdd: () => void;
  onToggle: (name: string, enabled: boolean) => void;
  onRemove: (name: string, scope?: McpScope) => void;
  onOauth: (name: string) => void;
  onPopular: (preset: (typeof POPULAR_MCP)[number]) => void;
  compose: boolean;
  setCompose: (v: boolean) => void;
  confirm: ConfirmState | null;
}) {
  const listedMap = new Map(listed.map((s) => [s.name, s]));
  return (
    <>
      <h3>MCP · {enabledMcpCount(servers)} 已启用</h3>
      <EmptyLine kind={empty} />
      <ul className="hub-rows">
        {servers.map((s) => {
          const row = listedMap.get(s.name);
          const enabled = row?.enabled ?? s.enabled !== false;
          const health = HEALTH_ZH[mcpHealthLabel({
            enabled,
            healthy: doctor[s.name]?.healthy ?? null,
          })] ?? "未知";
          const badge = SOURCE_ZH[mcpSourceBadge(s)] ?? mcpSourceBadge(s);
          const tools = doctor[s.name]?.tools ?? s.tools ?? [];
          const scope = row?.scope || s.scope || "user";
          return (
            <li key={s.name} className="hub-row">
              <div className="hub-row-main">
                <strong>{s.name}</strong>
                <span className="hub-meta">
                  {health} · {s.transport || "stdio"} · {scope === "project" ? "项目" : "用户"} · {badge}
                  {tools.length ? ` · ${tools.length} 个工具` : ""}
                </span>
              </div>
              <div className="hub-row-side">
                <button type="button" className="btn ghost" onClick={() => onOauth(s.name)}>
                  诊断
                </button>
                <button
                  type="button"
                  className={`btn ghost${isArmed(confirm, `mcp-rm:${s.name}`, Date.now()) ? " armed" : ""}`}
                  onClick={() => onRemove(s.name, (row?.scope as McpScope) || "user")}
                >
                  {dangerCaption(confirm, `mcp-rm:${s.name}`, `删除 ${s.name}`, `再点一次以删除 ${s.name}`)}
                </button>
                <button
                  type="button"
                  className={`toggle ${enabled ? "on" : ""}`}
                  aria-label={enabled ? t(locale, "hub.disable") : t(locale, "hub.enable")}
                  onClick={() => onToggle(s.name, enabled)}
                >
                  <i />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="hub-compose">
        <button type="button" className="hub-compose-toggle" onClick={() => setCompose(!compose)}>
          {compose ? "收起添加" : "添加服务器"}
        </button>
        {compose ? (
          <>
        <div className="set-stack">
          <label>名称</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="set-stack">
          <label>Transport</label>
          <MenuSelect
            ariaLabel="MCP transport"
            value={form.transport}
            options={[
              { value: "stdio", label: "stdio" },
              { value: "http", label: "http" },
              { value: "sse", label: "sse" },
            ]}
            onChange={(v) => setForm({ ...form, transport: v as McpTransport })}
          />
        </div>
        <div className="set-stack">
          <label>{form.transport === "stdio" ? "命令" : "URL"}</label>
          <input
            value={form.commandOrUrl ?? ""}
            onChange={(e) => setForm({ ...form, commandOrUrl: e.target.value })}
            placeholder={form.transport === "stdio" ? "npx" : "https://…"}
          />
        </div>
        {form.transport === "stdio" && (
          <div className="set-stack">
            <label>参数（空格分隔，写在 -- 之后）</label>
            <input
              value={(form.args ?? []).join(" ")}
              onChange={(e) => setForm({ ...form, args: e.target.value.split(/\s+/).filter(Boolean) })}
            />
          </div>
        )}
        <div className="set-stack">
          <label>环境变量 KEY=value（每行一条，值用 ${"{VAR}"}）</label>
          <textarea value={envDraft} onChange={(e) => setEnvDraft(e.target.value)} rows={3} />
        </div>
        {form.transport !== "stdio" && (
          <div className="set-stack">
            <label>Headers Name: Value（每行一条）</label>
            <textarea value={headerDraft} onChange={(e) => setHeaderDraft(e.target.value)} rows={3} />
          </div>
        )}
        <div className="set-stack">
          <label>范围</label>
          <MenuSelect
            ariaLabel="MCP scope"
            value={form.scope ?? "user"}
            options={[
              { value: "user", label: "user · ~/.grok/config.toml" },
              { value: "project", label: "project · .grok/config.toml", hint: cwd || "需要工作目录" },
            ]}
            onChange={(v) => setForm({ ...form, scope: v as McpScope })}
          />
        </div>
        <p className="hint">将执行：grok {mcpAddArgv(form).join(" ")}</p>
        <div className="set-actions">
          <button type="button" className="btn primary" onClick={onAdd} disabled={!form.name.trim()}>
            {t(locale, "hub.add")}
          </button>
        </div>
        <div className="set-actions">
          {POPULAR_MCP.map((p) => (
            <button key={p.name} type="button" className="btn ghost" onClick={() => onPopular(p)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="set-actions">
          <button type="button" className="btn ghost" onClick={() => onLoadToml("user")}>
            编辑用户 config.toml
          </button>
          <button type="button" className="btn ghost" onClick={() => onLoadToml("project")} disabled={!cwd}>
            编辑项目 config.toml
          </button>
        </div>
        {tomlOpen && (
          <>
            <MenuSelect
              ariaLabel="TOML 范围"
              value={tomlScope}
              options={[
                { value: "user", label: "用户 ~/.grok/config.toml" },
                { value: "project", label: "项目 .grok/config.toml" },
              ]}
              onChange={(next) => setTomlScope(next as "user" | "project")}
            />
            <textarea className="hub-toml" value={tomlText} onChange={(e) => setTomlText(e.target.value)} rows={12} />
            <div className="set-actions">
              <button type="button" className="btn primary" onClick={onSaveToml}>
                保存
              </button>
              <button type="button" className="btn ghost" onClick={() => setTomlOpen(false)}>
                收起
              </button>
            </div>
          </>
        )}
          </>
        ) : null}
      </div>
    </>
  );
}

function MarketTab({
  empty,
  source,
  setSource,
  installSource,
  setInstallSource,
  listing,
  onAdd,
  onUpdate,
  onRemove,
  onInstall,
  confirm,
}: {
  empty: ReturnType<typeof hubEmptyKind>;
  source: string;
  setSource: (s: string) => void;
  installSource: string;
  setInstallSource: (s: string) => void;
  listing: string;
  onAdd: () => void;
  onUpdate: () => void;
  onRemove: () => void;
  onInstall: (trust: boolean) => void;
  confirm: ConfirmState | null;
}) {
  return (
    <>
      <h3>市场</h3>
      <p className="hint">{marketplaceJsonHelp()}</p>
      <EmptyLine kind={empty} />
      <div className="set-stack">
        <label>源</label>
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="owner/repo、git URL 或本地路径" />
      </div>
      <div className="set-actions">
        <button type="button" className="btn primary" onClick={onAdd} disabled={!source.trim()}>
          添加
        </button>
        <button type="button" className="btn ghost" onClick={onUpdate}>
          刷新
        </button>
        <button
          type="button"
          className={`btn ghost${isArmed(confirm, "market-rm", Date.now()) ? " armed" : ""}`}
          onClick={onRemove}
          disabled={!source.trim()}
        >
          {dangerCaption(
            confirm,
            "market-rm",
            source.trim() ? `移除 ${source.trim()}` : "移除",
            `再点一次以移除 ${source.trim()}`,
          )}
        </button>
      </div>
      {listing.trim() ? <pre className="hub-preview">{listing.slice(0, 8000)}</pre> : null}
      <div className="hub-compose">
        <div className="set-stack">
          <label>安装插件</label>
          <input value={installSource} onChange={(e) => setInstallSource(e.target.value)} placeholder="owner/repo 或路径" />
        </div>
        <div className="set-actions">
          <button type="button" className="btn ghost" onClick={() => onInstall(false)} disabled={!installSource.trim()}>
            安装
          </button>
          <button type="button" className="btn primary" onClick={() => onInstall(true)} disabled={!installSource.trim()}>
            安装并信任
          </button>
        </div>
      </div>
    </>
  );
}

function HooksTab({
  locale,
  cwd,
  hooks,
  trusted,
  onTrust,
  onTemplate,
}: {
  locale: Locale;
  cwd: string;
  hooks: InspectHook[];
  trusted: boolean;
  onTrust: () => void;
  onTemplate: (tpl: (typeof HOOK_TEMPLATES)[number]) => void;
}) {
  return (
    <>
      {!trusted && cwd ? (
        <div className="trust-banner" role="status">
          <span>{t(locale, "trust.banner")}</span>
          <button type="button" className="btn primary" onClick={onTrust}>
            {t(locale, "trust.action")}
          </button>
        </div>
      ) : null}
      <h3>Hooks · {hooks.length}</h3>
      <ul className="hub-rows">
        {hooks.map((h, i) => (
          <li key={`${h.event}:${h.target}:${i}`} className="hub-row">
            <div className="hub-row-main">
              <strong>{h.event}</strong>
              <span className="hub-meta">
                {[h.hookType || "command", h.target, h.matcher].filter(Boolean).join(" · ")}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <div className="hub-compose">
        <p className="hub-group-label">模板</p>
        <div className="set-actions">
          {HOOK_TEMPLATES.map((tpl) => (
            <button key={tpl.id} type="button" className="btn ghost" onClick={() => onTemplate(tpl)} title={tpl.hint}>
              {tpl.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
