import { useCallback, useEffect, useRef, useState } from "react";
import {
  appendMemoryEvent,
  listSessions,
  listWorkspaceEntries,
  readMemoryEvents,
  readMemoryHost,
  readSessionUpdates,
  readTextFile,
  writeAllowedText,
  type MemoryHostSnapshot,
} from "../api";
import type { AgentDoctor } from "../lib/agent-doctor";
import type { AgentId } from "../lib/agent-id";
import { t, type Locale } from "../lib/i18n";
import { friendlyError } from "../lib/error-copy";
import { memoryCursorKey, localDayStamp } from "../lib/memory-clock";
import {
  BACKFILL_MAX_SWEEPS,
  backfillEligible,
  nextBackfillAction,
  sweepStateToPersist,
  unconsumedPageCount,
} from "../lib/memory-backfill";
import { evaluateDreamGates, type DreamTrigger } from "../lib/memory-gates";
import { parseDailyFile } from "../lib/memory-ingest";
import {
  appendDreamsAppendix,
  dreamAlreadyRunning,
  FOUNDING_PROMPT_TIMEOUT_MS,
  foundingBootstrapPrompts,
  loggedInAgentIds,
  openDreamAcp,
} from "../lib/memory-dream-acp";
import { runDreamSweep, type DreamIo } from "../lib/memory-dream";
import { pickFoundingKimiModel } from "../lib/memory-founding-model";
import { runFoundingDream } from "../lib/memory-founding-run";
import { applyGrokIngest, skipFoundingSession, type GrokIngestPage } from "../lib/memory-grok-turns";
import { DREAM_LOOKBACK_DAYS, loadLookbackDays } from "../lib/memory-daily-read";
import { persistDreamFiles, persistIngest, persistState } from "../lib/memory-host-persist";
import {
  dailyMdPath,
  dailyShardPath,
  DAILY_MAX_SHARDS,
  dreamsMdPath,
  skillProposalPath,
  userMdPath as userMdPathOf,
} from "../lib/memory-paths";
import { mainPrompt, parseMainOutput } from "../lib/memory-phase-prompt";
import { selectDreamInput } from "../lib/memory-weight";
import { armRecurringLocalHour } from "../lib/memory-schedule";
import {
  applyProposalDecision,
  parseProposalMarkdown,
  proposalMarkdown,
  skillMarkdownFromProposal,
  type SkillProposal,
} from "../lib/memory-skill-proposal";
import { emptyMemoryState, parseMemoryState } from "../lib/memory-state";
import { corpusLine, overlayStatus, parseDreamsMd, type DiaryEntry, type OverlayStatus } from "../lib/memory-view";
import { brandSessionList } from "../lib/session-list";
import { doctorAll } from "../lib/workbench-api";

export type DreamJobOpts = {
  enabled: boolean;
  dreamAgentId: AgentId;
  selectedAgentId: AgentId;
  doctors: readonly AgentDoctor[];
  locale: Locale;
  settingsHydrated: boolean;
  thresholdSessions: number;
  showToast: (msg: string) => void;
  skillNames?: readonly string[];
};

export { pickFoundingKimiModel, foundingBootstrapPrompts, FOUNDING_PROMPT_TIMEOUT_MS };

/** How often the accumulation trigger is re-checked while the app is open. */
const THRESHOLD_CHECK_MS = 10 * 60 * 1000;

function parseHostState(raw: string) {
  if (!raw.trim()) return emptyMemoryState();
  try {
    return parseMemoryState(JSON.parse(raw) as unknown);
  } catch {
    return emptyMemoryState();
  }
}

async function localDaily(memoryRoot: string, day: string, fallback: string): Promise<string> {
  try {
    return (await readTextFile(dailyMdPath(memoryRoot, day), memoryRoot)).text;
  } catch {
    return fallback.startsWith(`# ${day}`) ? fallback : "";
  }
}

async function loadDailyShards(memoryRoot: string, day: string, shard1: string): Promise<Record<number, string>> {
  const shards: Record<number, string> = { 1: shard1 };
  for (let index = 2; index <= DAILY_MAX_SHARDS; index++) {
    try {
      const text = (await readTextFile(dailyShardPath(memoryRoot, day, index), memoryRoot)).text;
      if (text) shards[index] = text;
    } catch {
      /* missing numbered shard */
    }
  }
  return shards;
}

async function ioFromHost(
  snap: MemoryHostSnapshot,
  day: string,
): Promise<{ io: DreamIo; shards: Record<number, string> }> {
  const dailyMd = await localDaily(snap.memoryRoot, day, snap.dailyMd);
  const shards = await loadDailyShards(snap.memoryRoot, day, dailyMd);
  return {
    io: {
      userMd: snap.userMd,
      dreamsMd: snap.dreamsMd,
      dailyMd,
      state: parseHostState(snap.stateJson),
    },
    shards,
  };
}

function sameShards(a: Record<number, string>, b: Record<number, string>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[Number(key)] !== b[Number(key)]) return false;
  }
  return true;
}

function shardLines(shards: Record<number, string> | undefined, dailyMd: string) {
  if (!shards) return parseDailyFile(dailyMd);
  return Object.keys(shards)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap((index) => parseDailyFile(shards[index] ?? ""));
}

async function recordEvent(event: Parameters<typeof appendMemoryEvent>[0]): Promise<void> {
  try {
    await appendMemoryEvent(event);
  } catch {
    /* events are best-effort; never fail a sweep over telemetry */
  }
}

async function collectIngestPages(
  io: DreamIo,
  memoryRoot: string,
  cursors: Record<string, number>,
): Promise<GrokIngestPage[]> {
  const sessions = brandSessionList(await listSessions(null));
  const pages: GrokIngestPage[] = [];
  for (const s of sessions) {
    if (s.agentId !== "grok" && s.agentId !== "claude") continue;
    if (io.state.forgotten.includes(s.id)) continue;
    if (skipFoundingSession({ id: s.id, cwd: s.cwd, dir: s.dir, sessionKind: s.sessionKind, parentSessionId: s.parentSessionId }, memoryRoot)) continue;
    const after = cursors[memoryCursorKey(s.agentId, s.id)] ?? 0;
    const page = await readSessionUpdates(s.id, after, s.dir);
    pages.push({ sessionId: s.id, cwd: s.cwd, rows: page.rows, nextByte: page.nextByte, agentId: s.agentId });
  }
  return pages;
}

async function collectGrokPages(io: DreamIo, memoryRoot: string): Promise<GrokIngestPage[]> {
  return collectIngestPages(io, memoryRoot, io.state.cursors);
}

async function collectFoundingPages(io: DreamIo, memoryRoot: string): Promise<GrokIngestPage[]> {
  const sessions = brandSessionList(await listSessions(null));
  const pages: GrokIngestPage[] = [];
  for (const s of sessions) {
    if (s.agentId !== "grok" && s.agentId !== "claude") continue;
    if (io.state.forgotten.includes(s.id)) continue;
    if (skipFoundingSession({ id: s.id, cwd: s.cwd, dir: s.dir, sessionKind: s.sessionKind, parentSessionId: s.parentSessionId }, memoryRoot)) continue;
    const after = io.state.foundingCursors[memoryCursorKey(s.agentId, s.id)] ?? 0;
    const page = await readSessionUpdates(s.id, after, s.dir);
    pages.push({ sessionId: s.id, cwd: s.cwd, rows: page.rows, nextByte: page.nextByte, agentId: s.agentId });
  }
  return pages;
}

function grokSkillsRootOf(doctors: readonly AgentDoctor[]): string {
  const home = doctors.find((d) => d.agentId === "grok")?.home;
  if (!home) return "";
  return `${home.replace(/\/+$/, "")}/skills`;
}

async function loadSkillProposals(memoryRoot: string): Promise<SkillProposal[]> {
  if (!memoryRoot) return [];
  try {
    const entries = await listWorkspaceEntries(`${memoryRoot}/skill-proposals`);
    const out: SkillProposal[] = [];
    for (const entry of entries) {
      if (entry.kind !== "file" || !entry.name.endsWith(".md")) continue;
      try {
        const parsed = parseProposalMarkdown((await readTextFile(entry.path, memoryRoot)).text);
        if (parsed) out.push(parsed);
      } catch {
        /* unreadable proposal */
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** MCP append batches since the last deep sweep join the accumulation count. */
async function mcpBatchesSince(sinceMs: number): Promise<number> {
  try {
    const events = await readMemoryEvents();
    return events.filter((e) => e.kind === "mcp_append" && e.at >= sinceMs).length;
  } catch {
    return 0;
  }
}

async function persistHostIngest(day: string, shards: Record<number, string>, state: DreamIo["state"]): Promise<void> {
  await persistIngest({ day, shards, state }).catch(() => undefined);
}

export function useDreamJob(opts: DreamJobOpts) {
  const [diary, setDiary] = useState<DiaryEntry[]>([]);
  const [status, setStatus] = useState<OverlayStatus>({ kind: "idle", lastAt: null });
  const [corpus, setCorpus] = useState<string | null>(null);
  const [userMd, setUserMd] = useState<string | null>(null);
  const [memoryRoot, setMemoryRoot] = useState("");
  const [tagline, setTagline] = useState<string | null>(null);
  const [foundingAt, setFoundingAt] = useState<number | null>(null);
  const [skillProposals, setSkillProposals] = useState<SkillProposal[]>([]);
  const runningRef = useRef(false);
  const catchUpTried = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const applyIo = useCallback((io: DreamIo, root: string, pending: number, shards?: Record<number, string>) => {
    setMemoryRoot(root);
    setDiary(parseDreamsMd(io.dreamsMd));
    setStatus(overlayStatus(io.state, pending));
    setCorpus(corpusLine(shardLines(shards, io.dailyMd)));
    setUserMd(io.userMd.trim() ? io.userMd : null);
    setTagline(io.state.tagline);
    setFoundingAt(io.state.foundingAt);
  }, []);

  const refreshFromHost = useCallback(async () => {
    const now = Date.now();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const day = localDayStamp(now, tz);
    const snap = await readMemoryHost();
    const loaded = await ioFromHost(snap, day);
    const pages = await collectGrokPages(loaded.io, snap.memoryRoot);
    const ingested = applyGrokIngest(loaded.io, pages, day, snap.memoryRoot, loaded.shards);
    const cursorsChanged =
      JSON.stringify(ingested.io.state.cursors) !== JSON.stringify(loaded.io.state.cursors);
    if (ingested.newSessionCount > 0 || cursorsChanged) {
      await persistHostIngest(day, ingested.shards, ingested.io.state);
    }
    const io = ingested.io;
    const newSessionCount = ingested.newSessionCount;
    const mcpBatches = await mcpBatchesSince(io.state.lastDeepAt ?? 0);
    const pending = newSessionCount + mcpBatches;
    applyIo(io, snap.memoryRoot, pending, ingested.shards);
    void loadSkillProposals(snap.memoryRoot).then(setSkillProposals).catch(() => setSkillProposals([]));
    return { snap, io, now, tz, day, pending, newSessionCount, pages, shards: ingested.shards };
  }, [applyIo]);

  const runSweep = useCallback(async (trigger: DreamTrigger) => {
    const o = optsRef.current;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = Date.now();
    const day = localDayStamp(now, tz);
    if (runningRef.current) {
      if (trigger === "manual") o.showToast(t(o.locale, "memory.lockHeld"));
      return;
    }
    let snap: MemoryHostSnapshot;
    let io: DreamIo;
    let shards: Record<number, string> = {};
    try {
      snap = await readMemoryHost();
      const loaded = await ioFromHost(snap, day);
      io = loaded.io;
      shards = loaded.shards;
    } catch (e) {
      o.showToast(friendlyError(e));
      return;
    }
    const lockHeld = !!io.state.lockOwner;
    if (trigger === "manual") {
      const gate = evaluateDreamGates({
        enabled: o.enabled,
        now,
        lastDeepAt: io.state.lastDeepAt,
        lastScanAt: io.state.lastScanAt,
        pendingMaterial: 0,
        thresholdSessions: o.thresholdSessions,
        lockHeld,
        trigger,
      });
      if (!gate.ok && gate.reason === "locked") {
        o.showToast(t(o.locale, "memory.lockHeld"));
        return;
      }
    }
    const docs = await doctorAll().catch(() => [...o.doctors]);
    const loggedIn = loggedInAgentIds(docs);
    let pages = await collectGrokPages(io, snap.memoryRoot);
    const newSessionCount =
      trigger === "manual" ? 0 : applyGrokIngest(io, pages, day, snap.memoryRoot, shards).newSessionCount;
    const mcpBatches = trigger === "manual" ? 0 : await mcpBatchesSince(io.state.lastDeepAt ?? 0);
    const pendingMaterial = newSessionCount + mcpBatches;
    runningRef.current = true;
    setStatus({ kind: "running" });
    const acp = { handle: null as Awaited<ReturnType<typeof openDreamAcp>> | null };
    const usage = { inChars: 0, outChars: 0, selected: 0 };
    let postIngest: DreamIo = io;
    const mayBackfill = backfillEligible(trigger, io.state.lastDeepAt);
    let currentTrigger = trigger;
    let sweepsDone = 0;
    let stoppedEarly = false;
    let pending = pendingMaterial;
    let lastIo = io;
    let previousLastScanAt: number | null | undefined;
    try {
      while (sweepsDone < BACKFILL_MAX_SWEEPS) {
        const sweepNow = Date.now();
        const iterationBefore = io.userMd;
        let shardsChanged = false;
        let iterationStoppedEarly = false;
        const result = await runDreamSweep({
          trigger: currentTrigger,
          enabled: o.enabled,
          now: sweepNow,
          pendingMaterial: currentTrigger === "manual" ? 0 : pendingMaterial,
          thresholdSessions: o.thresholdSessions,
          dreamAgentId: o.dreamAgentId,
          loggedIn,
          io,
          runPhase: async (phase, current) => {
            if (phase === "gather") {
              const ingested = applyGrokIngest(current, pages, day, snap.memoryRoot, shards);
              iterationStoppedEarly = ingested.stoppedEarly;
              shardsChanged = !sameShards(shards, ingested.shards);
              shards = ingested.shards;
              postIngest = ingested.io;
              await persistIngest({ day, shards: ingested.shards, state: ingested.io.state }).catch(() => undefined);
              return { dailyMd: ingested.io.dailyMd, state: ingested.io.state };
            }
            const lookback = await loadLookbackDays(snap.memoryRoot, day, DREAM_LOOKBACK_DAYS, {
              todayShards: shards,
              todayFallback: current.dailyMd,
            });
            const selection = selectDreamInput(lookback, day);
            usage.selected = selection.selected.length;
            if (!acp.handle) {
              await persistState(current.state);
              acp.handle = await openDreamAcp({
                agentId: o.dreamAgentId,
                memoryRoot: snap.memoryRoot,
                alreadyRunning: dreamAlreadyRunning(o.selectedAgentId, o.dreamAgentId),
              });
            }
            const prompt = mainPrompt(current, selection.selected, o.skillNames ?? []);
            usage.inChars = prompt.length;
            const text = await acp.handle.prompt(prompt);
            usage.outChars = text.length;
            const parsed = parseMainOutput(text);
            return {
              userMd: parsed.userMd ?? undefined,
              dreamsMd: parsed.diary ? appendDreamsAppendix(current.dreamsMd, parsed.diary) : undefined,
              tagline: parsed.tagline ?? undefined,
            };
          },
        });
        postIngest = result.io;
        lastIo = result.io;
        io = result.io;
        stoppedEarly = iterationStoppedEarly;
        pending = unconsumedPageCount(pages, result.io.state.cursors, result.io.state.forgotten);
        sweepsDone += 1;
        const persistStatePayload = sweepStateToPersist(
          result.io.state,
          result.started,
          previousLastScanAt,
        );
        if (result.io.state.lastStatus === "failed" || !result.started) {
          await persistState(persistStatePayload);
        } else {
          if (shardsChanged) await persistIngest({ day, shards, state: result.io.state });
          await persistDreamFiles({
            userMd: result.io.userMd,
            dreamsMd: result.io.dreamsMd,
            state: result.io.state,
          });
        }
        if (result.started) {
          const deltaBytes = Math.max(0, result.io.userMd.length - iterationBefore.length);
          await recordEvent({
            at: sweepNow,
            kind: "dream_sweep",
            agent: o.dreamAgentId,
            prompts: 1,
            inChars: usage.inChars,
            outChars: usage.outChars,
            count: usage.selected,
            bytes: deltaBytes,
          });
          if (result.io.userMd !== iterationBefore) {
            await recordEvent({
              at: sweepNow,
              kind: "promote",
              agent: o.dreamAgentId,
              count: 1,
              bytes: deltaBytes,
            });
          }
        }
        if (
          !mayBackfill ||
          !result.started ||
          nextBackfillAction({
            sweepsDone,
            stoppedEarly,
            pending,
            lastReason: result.reason,
          }) === "stop"
        ) {
          break;
        }
        currentTrigger = "manual";
        previousLastScanAt = result.io.state.lastScanAt;
        io = { ...result.io, state: { ...result.io.state, lastScanAt: null } };
        pages = await collectGrokPages(io, snap.memoryRoot);
      }
      applyIo(lastIo, snap.memoryRoot, pending, shards);
    } catch (e) {
      const failed: DreamIo = {
        ...postIngest,
        state: { ...postIngest.state, lastStatus: "failed", lastError: String(e), lockOwner: null },
      };
      await persistState(failed.state).catch(() => undefined);
      applyIo(failed, snap.memoryRoot, 0, shards);
    } finally {
      runningRef.current = false;
      if (acp.handle) await acp.handle.close().catch(() => undefined);
    }
  }, [applyIo]);

  const onDreamNow = useCallback(() => {
    void runSweep("manual");
  }, [runSweep]);

  const runFounding = useCallback(async () => {
    const o = optsRef.current;
    if (runningRef.current) {
      o.showToast(t(o.locale, "memory.lockHeld"));
      return;
    }
    runningRef.current = true;
    setStatus({ kind: "founding" });
    try {
      const now = Date.now();
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const day = localDayStamp(now, tz);
      const snap = await readMemoryHost();
      const loaded = await ioFromHost(snap, day);
      const result = await runFoundingDream({
        io: loaded.io,
        memoryRoot: snap.memoryRoot,
        selectedAgentId: o.selectedAgentId,
        doctors: o.doctors,
        skillNames: o.skillNames ?? [],
        now,
        day,
        grokSkillsRoot: grokSkillsRootOf(o.doctors),
        listPages: (current) => collectFoundingPages(current, snap.memoryRoot),
        openAcp: (opts) =>
          openDreamAcp({
            ...opts,
            promptTimeoutMs: opts.promptTimeoutMs ?? FOUNDING_PROMPT_TIMEOUT_MS,
          }),
        persistState,
        persistDreamFiles,
        writeText: (path, text) => writeAllowedText(path, text, snap.memoryRoot),
        readText: async (path) => (await readTextFile(path, snap.memoryRoot)).text,
        readGlobalMemory: async () => {
          const home = o.doctors.find((d) => d.agentId === "grok")?.home;
          if (!home) return "";
          try {
            return (await readTextFile(`${home.replace(/\/+$/, "")}/memory/MEMORY.md`, home)).text;
          } catch {
            return "";
          }
        },
      });
      applyIo(result.io, snap.memoryRoot, 0, loaded.shards);
      setSkillProposals(await loadSkillProposals(snap.memoryRoot));
      if (result.error === "lock") o.showToast(t(o.locale, "memory.lockHeld"));
      else if (result.error === "kimi-login") o.showToast(t(o.locale, "memory.foundingNeedKimi"));
      else if (result.error === "k3") o.showToast(t(o.locale, "memory.foundingNeedK3"));
      else if (result.error && /caller workspace does not match/i.test(result.error)) {
        o.showToast(t(o.locale, "memory.foundingWorkspace"));
      } else if (result.error) o.showToast(result.error);
    } catch (e) {
      o.showToast(friendlyError(e));
    } finally {
      runningRef.current = false;
    }
  }, [applyIo]);

  const onFoundingNow = useCallback(() => {
    void runFounding();
  }, [runFounding]);

  const onProposalDecision = useCallback(async (id: string, decision: "approved" | "dismissed") => {
    const o = optsRef.current;
    const root = memoryRoot;
    if (!root || !id) return;
    const path = skillProposalPath(root, id);
    try {
      const parsed = parseProposalMarkdown((await readTextFile(path, root)).text);
      if (!parsed) return;
      const next = applyProposalDecision(parsed, decision);
      const md = proposalMarkdown(next);
      if (md) await writeAllowedText(path, md, root);
      if (decision === "approved") {
        const skillsRoot = grokSkillsRootOf(o.doctors);
        if (skillsRoot) {
          await writeAllowedText(
            `${skillsRoot}/${next.id}/SKILL.md`,
            skillMarkdownFromProposal(next),
            skillsRoot,
          );
        }
      }
      setSkillProposals(await loadSkillProposals(root));
    } catch (e) {
      o.showToast(friendlyError(e));
    }
  }, [memoryRoot]);

  useEffect(() => {
    void refreshFromHost().catch(() => undefined);
  }, [refreshFromHost]);

  useEffect(() => {
    if (!opts.settingsHydrated || catchUpTried.current) return;
    catchUpTried.current = true;
    void (async () => {
      try {
        const loaded = await refreshFromHost();
        if (loaded.io.state.lastDeepAt === null) await runSweep("manual");
      } catch {
        /* best-effort */
      }
    })();
  }, [opts.settingsHydrated, refreshFromHost, runSweep]);

  // Accumulation trigger: cheap pre-check on the clock only, then let the
  // real gate (with fresh material counts) decide inside runSweep.
  useEffect(() => {
    if (!opts.settingsHydrated || !opts.enabled) return;
    const check = () => {
      void (async () => {
        try {
          const snap = await readMemoryHost();
          const state = parseHostState(snap.stateJson);
          const cheap = evaluateDreamGates({
            enabled: true,
            now: Date.now(),
            lastDeepAt: state.lastDeepAt,
            lastScanAt: state.lastScanAt,
            pendingMaterial: Number.MAX_SAFE_INTEGER,
            thresholdSessions: optsRef.current.thresholdSessions,
            lockHeld: !!state.lockOwner,
            trigger: "threshold",
          });
          if (cheap.ok) await runSweep("threshold");
        } catch {
          /* best-effort */
        }
      })();
    };
    const timer = window.setInterval(check, THRESHOLD_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [opts.settingsHydrated, opts.enabled, runSweep]);

  useEffect(() => {
    if (!opts.settingsHydrated || !opts.enabled) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return armRecurringLocalHour({
      hour: 3,
      timeZone: tz,
      now: () => Date.now(),
      onFire: () => {
        void runSweep("schedule");
      },
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (id) => window.clearTimeout(id as number),
    });
  }, [opts.settingsHydrated, opts.enabled, opts.dreamAgentId, runSweep]);

  return {
    onDreamNow,
    onFoundingNow,
    onProposalDecision,
    diary,
    status,
    corpus,
    userMd,
    tagline,
    foundingAt,
    skillProposals,
    userMdPath: memoryRoot ? userMdPathOf(memoryRoot) : "",
    dreamsMdPath: memoryRoot ? dreamsMdPath(memoryRoot) : "",
    memoryRoot,
  };
}
