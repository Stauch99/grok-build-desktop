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
  grokMcpDoctor,
  grokMcpList,
  grokMcpRemove,
  mcpAddArgv,
  parseJsonList,
  parseJsonObject,
  type McpAddInput,
  type McpScope,
  type McpTransport,
} from "../lib/grok-cli";
import { grokCliNote } from "../lib/grok-note";
import {
  disableHubMcpServer,
  enableHubMcpServer,
  installMarketplaceSkill,
  removeHubMcpServer,
  syncHubMcpServer,
} from "../lib/workbench-api";
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
const SCOPE_KEYS: Record<SkillScope, string> = {
  cwd: "hub.scope.cwd",
  repo: "hub.scope.repo",
  user: "hub.scope.user",
  bundled: "hub.scope.bundled",
  plugin: "hub.scope.plugin",
  compat: "hub.scope.compat",
};

const HEALTH_KEYS: Record<string, string> = {
  Connected: "hub.health.connected",
  Failed: "hub.health.failed",
  Disabled: "hub.health.disabled",
  Unknown: "hub.health.unknown",
};

const SOURCE_KEYS: Record<string, string> = {
  toml: "hub.source.toml",
  project: "hub.source.project",
  plugin: "hub.source.plugin",
  other: "hub.source.other",
};

const EMPTY_KEYS: Record<string, string> = {
  skills: "hub.empty.skillsAlt",
  mcp: "hub.empty.mcp",
  plugins: "hub.empty.plugins",
  market: "hub.empty.marketAlt",
  "market-fail": "hub.empty.marketFail",
  search: "hub.empty.searchAlt",
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
          <button type="button" className="icon-btn" aria-label={t(locale, "common.close")} onClick={onClose}>
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
            placeholder={t(locale, "hub.search")}
            aria-label={t(locale, "hub.searchAria")}
          />
          <button type="button" className="icon-btn" onClick={() => void load()} disabled={busy} data-tip={t(locale, "common.refresh")} aria-label={t(locale, "common.refresh")}>
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
        <div className="hub-body pane-in" key={tab} role="tabpanel" id={`hub-panel-${tab}`} aria-labelledby={`hub-tab-${tab}`}>
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
                void runNoted(async () => {
                  const input = {
                    ...mcpForm,
                    env: envDraft.split("\n").map((s) => s.trim()).filter(Boolean),
                    headers: headerDraft.split("\n").map((s) => s.trim()).filter(Boolean),
                    args: mcpForm.args,
                  };
                  await syncHubMcpServer({
                    name: input.name,
                    transport: input.transport,
                    commandOrUrl: input.commandOrUrl,
                    args: input.args,
                    env: input.env,
                    headers: input.headers,
                  });
                  return grokMcpAdd(input, cwd || null);
                })
              }
              onToggle={(name, enabled) =>
                void runNoted(() => (enabled ? disableHubMcpServer(name) : enableHubMcpServer(name)))
              }
              onRemove={(name, scope) =>
                askDanger(`mcp-rm:${name}`, () =>
                  void runNoted(async () => {
                    await removeHubMcpServer(name);
                    return grokMcpRemove(name, scope, cwd || null);
                  }),
                )
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
              locale={locale}
              empty={empty}
              source={marketSource}
              setSource={setMarketSource}
              installSource={installSource}
              setInstallSource={setInstallSource}
              listing={marketText}
              onAdd={() =>
                void runNoted(async () => {
                  if (marketSource.startsWith("/") || marketSource.startsWith(".")) {
                    await installMarketplaceSkill(marketSource);
                    return;
                  }
                  return grokMarketplaceAdd(marketSource, cwd || null);
                })
              }
              onUpdate={() => void runNoted(() => grokMarketplaceUpdate(undefined, cwd || null))}
              onRemove={() =>
                askDanger("market-rm", () => void runNoted(() => grokMarketplaceRemove(marketSource, cwd || null)))
              }
              onInstall={() => void runNoted(async () => { await installMarketplaceSkill(installSource); })}
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
                {showLog ? t(locale, "hub.collapseLog") : t(locale, "hub.commandLog", { n: logs.length })}
              </button>
              {showLog ? (
                <pre className="hub-log" aria-live="polite">
                  {logs.join("\n")}
                </pre>
              ) : null}
            </div>
          )}
          {note && <p className="set-note">{busy ? t(locale, "hub.working") : note}</p>}
        </div>
      </div>
    </div>
  );
}

function EmptyLine({ kind, locale }: { kind: ReturnType<typeof hubEmptyKind>; locale: Locale }) {
  if (!kind) return null;
  return <p className="float-empty">{t(locale, EMPTY_KEYS[kind])}</p>;
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
      <h3>{t(locale, "hub.skillCount", { n: skills.length })}</h3>
      <EmptyLine kind={empty} locale={locale} />
      {groups.map((g) => (
        <div key={g.scope} className="hub-group">
          <div className="hub-group-label">{t(locale, SCOPE_KEYS[g.scope])}</div>
          <ul className="hub-rows">
            {g.items.map((skill) => {
              const qname = qualifySkillName(skill, skills);
              const off = disabled.includes(skill.name) || skill.disabled;
              const bits = [
                skill.description,
                skill.userInvocable === false ? t(locale, "hub.notInSlash") : null,
                qname !== skill.name ? t(locale, "hub.slashName", { name: qname }) : null,
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
          <button type="button" className="file-open" onClick={() => void openPath(preview.path)} data-tip={t(locale, "hub.openFinder")} aria-label={t(locale, "hub.openFinder")}>
            <IconFinder size={14} />
          </button>
        </div>
      )}
      <div className="hub-compose">
        <button type="button" className="hub-compose-toggle" onClick={() => setCompose(!compose)}>
          {compose ? t(locale, "hub.collapseNew") : t(locale, "hub.newSkill")}
        </button>
        {compose ? (
          <>
        <div className="set-stack">
          <label>{t(locale, "hub.name")}</label>
          <input value={newSkill.name} onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })} />
        </div>
        <div className="set-stack">
          <label>{t(locale, "hub.scope")}</label>
          <MenuSelect
            ariaLabel={t(locale, "hub.skillScope")}
            value={newSkill.scope}
            options={[
              { value: "user", label: t(locale, "hub.userSkillsPath") },
              { value: "project", label: t(locale, "hub.projectSkillsPath"), hint: cwd || t(locale, "hub.needCwd") },
            ]}
            onChange={(v) => setNewSkill({ ...newSkill, scope: v as "user" | "project" })}
          />
        </div>
        <div className="set-stack">
          <label>{t(locale, "hub.template")}</label>
          <MenuSelect
            ariaLabel={t(locale, "hub.skillTemplate")}
            value={newSkill.template}
            options={[
              { value: "blank", label: t(locale, "hub.blank") },
              { value: "review", label: "Review" },
              { value: "commit", label: "Commit" },
            ]}
            onChange={(v) => setNewSkill({ ...newSkill, template: v })}
          />
        </div>
        <div className="set-actions">
          <button type="button" className="btn primary" onClick={onCreate} disabled={!newSkill.name.trim()}>
            {t(locale, "hub.writeSkill")}
          </button>
          <button type="button" className="btn ghost" onClick={onCreateSlash}>
            {t(locale, "hub.handOffCreate")}
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
      <h3>{t(locale, "hub.mcpEnabledHeading", { n: enabledMcpCount(servers) })}</h3>
      <EmptyLine kind={empty} locale={locale} />
      <ul className="hub-rows">
        {servers.map((s) => {
          const row = listedMap.get(s.name);
          const enabled = row?.enabled ?? s.enabled !== false;
          const health = t(locale, HEALTH_KEYS[mcpHealthLabel({
            enabled,
            healthy: doctor[s.name]?.healthy ?? null,
          })] ?? "hub.health.unknown");
          const badgeKey = SOURCE_KEYS[mcpSourceBadge(s)];
          const badge = badgeKey ? t(locale, badgeKey) : mcpSourceBadge(s);
          const tools = doctor[s.name]?.tools ?? s.tools ?? [];
          const scope = row?.scope || s.scope || "user";
          return (
            <li key={s.name} className="hub-row">
              <div className="hub-row-main">
                <strong>{s.name}</strong>
                <span className="hub-meta">
                  {health} · {s.transport || "stdio"} · {scope === "project" ? t(locale, "hub.source.project") : t(locale, "hub.scope.user")} · {badge}
                  {tools.length ? ` · ${t(locale, "hub.nTools", { n: tools.length })}` : ""}
                </span>
              </div>
              <div className="hub-row-side">
                <button type="button" className="btn ghost" onClick={() => onOauth(s.name)}>
                  {t(locale, "hub.diagnose")}
                </button>
                <button
                  type="button"
                  className={`btn ghost${isArmed(confirm, `mcp-rm:${s.name}`, Date.now()) ? " armed" : ""}`}
                  onClick={() => onRemove(s.name, (row?.scope as McpScope) || "user")}
                >
                  {dangerCaption(confirm, `mcp-rm:${s.name}`, t(locale, "hub.deleteName", { name: s.name }), t(locale, "hub.deleteAgain", { name: s.name }))}
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
          {compose ? t(locale, "hub.collapseAdd") : t(locale, "hub.addServer")}
        </button>
        {compose ? (
          <>
        <div className="set-stack">
          <label>{t(locale, "hub.name")}</label>
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
          <label>{form.transport === "stdio" ? t(locale, "hub.command") : "URL"}</label>
          <input
            value={form.commandOrUrl ?? ""}
            onChange={(e) => setForm({ ...form, commandOrUrl: e.target.value })}
            placeholder={form.transport === "stdio" ? "npx" : "https://…"}
          />
        </div>
        {form.transport === "stdio" && (
          <div className="set-stack">
            <label>{t(locale, "hub.argsHint")}</label>
            <input
              value={(form.args ?? []).join(" ")}
              onChange={(e) => setForm({ ...form, args: e.target.value.split(/\s+/).filter(Boolean) })}
            />
          </div>
        )}
        <div className="set-stack">
          <label>{t(locale, "hub.envHint")}</label>
          <textarea value={envDraft} onChange={(e) => setEnvDraft(e.target.value)} rows={3} />
        </div>
        {form.transport !== "stdio" && (
          <div className="set-stack">
            <label>{t(locale, "hub.headersHint")}</label>
            <textarea value={headerDraft} onChange={(e) => setHeaderDraft(e.target.value)} rows={3} />
          </div>
        )}
        <div className="set-stack">
          <label>{t(locale, "hub.scope")}</label>
          <MenuSelect
            ariaLabel="MCP scope"
            value={form.scope ?? "user"}
            options={[
              { value: "user", label: "user · ~/.grok/config.toml" },
              { value: "project", label: "project · .grok/config.toml", hint: cwd || t(locale, "hub.needCwd") },
            ]}
            onChange={(v) => setForm({ ...form, scope: v as McpScope })}
          />
        </div>
        <p className="hint">{t(locale, "hub.mcpWriteHint", { cmd: mcpAddArgv(form).join(" ") })}</p>
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
            {t(locale, "hub.editUserToml")}
          </button>
          <button type="button" className="btn ghost" onClick={() => onLoadToml("project")} disabled={!cwd}>
            {t(locale, "hub.editProjectToml")}
          </button>
        </div>
        {tomlOpen && (
          <>
            <MenuSelect
              ariaLabel={t(locale, "hub.tomlScope")}
              value={tomlScope}
              options={[
                { value: "user", label: t(locale, "hub.userToml") },
                { value: "project", label: t(locale, "hub.projectToml") },
              ]}
              onChange={(next) => setTomlScope(next as "user" | "project")}
            />
            <textarea className="hub-toml" value={tomlText} onChange={(e) => setTomlText(e.target.value)} rows={12} />
            <div className="set-actions">
              <button type="button" className="btn primary" onClick={onSaveToml}>
                {t(locale, "preview.save")}
              </button>
              <button type="button" className="btn ghost" onClick={() => setTomlOpen(false)}>
                {t(locale, "hub.collapse")}
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
  locale,
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
  locale: Locale;
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
      <h3>{t(locale, "hub.marketplace")}</h3>
      <p className="hint">{marketplaceJsonHelp()}</p>
      <EmptyLine kind={empty} locale={locale} />
      <div className="set-stack">
        <label>{t(locale, "hub.sourceLabel")}</label>
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder={t(locale, "hub.sourcePlaceholder")} />
      </div>
      <div className="set-actions">
        <button type="button" className="btn primary" onClick={onAdd} disabled={!source.trim()}>
          {t(locale, "hub.add")}
        </button>
        <button type="button" className="btn ghost" onClick={onUpdate}>
          {t(locale, "common.refresh")}
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
            source.trim() ? t(locale, "hub.removeName", { name: source.trim() }) : t(locale, "hub.remove"),
            t(locale, "hub.removeAgain", { name: source.trim() }),
          )}
        </button>
      </div>
      {listing.trim() ? <pre className="hub-preview">{listing.slice(0, 8000)}</pre> : null}
      <div className="hub-compose">
        <div className="set-stack">
          <label>{t(locale, "hub.installPlugin")}</label>
          <input value={installSource} onChange={(e) => setInstallSource(e.target.value)} placeholder={t(locale, "hub.installPlaceholder")} />
        </div>
        <div className="set-actions">
          <button type="button" className="btn ghost" onClick={() => onInstall(false)} disabled={!installSource.trim()}>
            {t(locale, "hub.install")}
          </button>
          <button type="button" className="btn primary" onClick={() => onInstall(true)} disabled={!installSource.trim()}>
            {t(locale, "hub.installTrust")}
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
        <p className="hub-group-label">{t(locale, "hub.template")}</p>
        <div className="set-actions">
          {HOOK_TEMPLATES.map((tpl) => (
            <button key={tpl.id} type="button" className="btn ghost" onClick={() => onTemplate(tpl)} data-tip={tpl.hint}>
              {tpl.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
