import { useCallback, useEffect, useRef, useState } from "react";
import {
  appendMemoryEvent,
  listSessions,
  readMemoryEvents,
  readMemoryHost,
  readSessionUpdates,
  readTextFile,
  writeMemoryHost,
  type MemoryHostSnapshot,
} from "../api";
import type { AgentDoctor } from "../lib/agent-doctor";
import type { AgentId } from "../lib/agent-id";
import { t, type Locale } from "../lib/i18n";
import { friendlyError } from "../lib/error-copy";
import { memoryCursorKey, localDayStamp } from "../lib/memory-clock";
import { evaluateDreamGates, type DreamTrigger } from "../lib/memory-gates";
import { parseDailyFile } from "../lib/memory-ingest";
import { appendDreamsAppendix, dreamAlreadyRunning, loggedInAgentIds, openDreamAcp } from "../lib/memory-dream-acp";
import { runDreamSweep, type DreamIo } from "../lib/memory-dream";
import { applyGrokIngest, skipDreamIngestPage, type GrokIngestPage } from "../lib/memory-grok-turns";
import { dailyMdPath, dreamsMdPath, userMdPath as userMdPathOf } from "../lib/memory-paths";
import { mainPrompt, parseMainOutput } from "../lib/memory-phase-prompt";
import { selectDreamInput } from "../lib/memory-weight";
import { armRecurringLocalHour } from "../lib/memory-schedule";
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
};

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

async function ioFromHost(snap: MemoryHostSnapshot, day: string): Promise<DreamIo> {
  const dailyMd = await localDaily(snap.memoryRoot, day, snap.dailyMd);
  return {
    userMd: snap.userMd,
    dreamsMd: snap.dreamsMd,
    dailyMd,
    state: parseHostState(snap.stateJson),
  };
}

async function persistIo(io: DreamIo, day: string): Promise<void> {
  await writeMemoryHost({
    userMd: io.userMd,
    dreamsMd: io.dreamsMd,
    dailyMd: io.dailyMd,
    dailyDay: day,
    stateJson: JSON.stringify(io.state),
  });
}

async function recordEvent(event: Parameters<typeof appendMemoryEvent>[0]): Promise<void> {
  try {
    await appendMemoryEvent(event);
  } catch {
    /* events are best-effort; never fail a sweep over telemetry */
  }
}

async function collectGrokPages(io: DreamIo, memoryRoot: string): Promise<GrokIngestPage[]> {
  const sessions = brandSessionList(await listSessions(null));
  const pages: GrokIngestPage[] = [];
  for (const s of sessions) {
    if (s.agentId !== "grok") continue;
    if (io.state.forgotten.includes(s.id)) continue;
    if (skipDreamIngestPage({ sessionId: s.id, cwd: s.cwd }, memoryRoot)) continue;
    const after = io.state.cursors[memoryCursorKey("grok", s.id)] ?? 0;
    const page = await readSessionUpdates(s.id, after);
    pages.push({ sessionId: s.id, cwd: s.cwd, rows: page.rows, nextByte: page.nextByte });
  }
  return pages;
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

function countNewGrokSessions(io: DreamIo, pages: GrokIngestPage[], day: string, memoryRoot: string): number {
  return applyGrokIngest(io, pages, day, memoryRoot).newSessionCount;
}

export function useDreamJob(opts: DreamJobOpts) {
  const [diary, setDiary] = useState<DiaryEntry[]>([]);
  const [status, setStatus] = useState<OverlayStatus>({ kind: "idle", lastAt: null });
  const [corpus, setCorpus] = useState<string | null>(null);
  const [userMd, setUserMd] = useState<string | null>(null);
  const [memoryRoot, setMemoryRoot] = useState("");
  const [profileUpdated, setProfileUpdated] = useState(false);
  const [tagline, setTagline] = useState<string | null>(null);
  const runningRef = useRef(false);
  const catchUpTried = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const applyIo = useCallback((io: DreamIo, root: string, pending: number) => {
    setMemoryRoot(root);
    setDiary(parseDreamsMd(io.dreamsMd));
    setStatus(overlayStatus(io.state, pending));
    setCorpus(corpusLine(parseDailyFile(io.dailyMd)));
    setUserMd(io.userMd.trim() ? io.userMd : null);
    setTagline(io.state.tagline);
  }, []);

  const refreshFromHost = useCallback(async () => {
    const now = Date.now();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const day = localDayStamp(now, tz);
    const snap = await readMemoryHost();
    const io = await ioFromHost(snap, day);
    const pages = await collectGrokPages(io, snap.memoryRoot);
    const newSessionCount = countNewGrokSessions(io, pages, day, snap.memoryRoot);
    const mcpBatches = await mcpBatchesSince(io.state.lastDeepAt ?? 0);
    const pending = newSessionCount + mcpBatches;
    applyIo(io, snap.memoryRoot, pending);
    return { snap, io, now, tz, day, pending, newSessionCount, pages };
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
    try {
      snap = await readMemoryHost();
      io = await ioFromHost(snap, day);
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
    const pages = await collectGrokPages(io, snap.memoryRoot);
    const newSessionCount = trigger === "manual" ? 0 : countNewGrokSessions(io, pages, day, snap.memoryRoot);
    const mcpBatches = trigger === "manual" ? 0 : await mcpBatchesSince(io.state.lastDeepAt ?? 0);
    const pendingMaterial = newSessionCount + mcpBatches;
    runningRef.current = true;
    setStatus({ kind: "running" });
    const beforeUser = io.userMd;
    const acp = { handle: null as Awaited<ReturnType<typeof openDreamAcp>> | null };
    const usage = { inChars: 0, outChars: 0, selected: 0 };
    try {
      const result = await runDreamSweep({
        trigger,
        enabled: o.enabled,
        now,
        pendingMaterial,
        thresholdSessions: o.thresholdSessions,
        dreamAgentId: o.dreamAgentId,
        loggedIn,
        io,
        runPhase: async (phase, current) => {
          if (phase === "gather") {
            const merged = applyGrokIngest(current, pages, day, snap.memoryRoot).io;
            return { dailyMd: merged.dailyMd, state: merged.state };
          }
          const selection = selectDreamInput([{ lines: parseDailyFile(current.dailyMd), day }], day);
          usage.selected = selection.selected.length;
          if (!acp.handle) {
            await persistIo(current, day);
            acp.handle = await openDreamAcp({
              agentId: o.dreamAgentId,
              memoryRoot: snap.memoryRoot,
              alreadyRunning: dreamAlreadyRunning(o.selectedAgentId, o.dreamAgentId),
            });
          }
          const prompt = mainPrompt(current, selection.selected);
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
      await persistIo(result.io, day);
      if (result.started) {
        const deltaBytes = Math.max(0, result.io.userMd.length - beforeUser.length);
        await recordEvent({
          at: now,
          kind: "dream_sweep",
          agent: o.dreamAgentId,
          prompts: 1,
          inChars: usage.inChars,
          outChars: usage.outChars,
          count: usage.selected,
          bytes: deltaBytes,
        });
        if (result.io.userMd !== beforeUser) {
          await recordEvent({
            at: now,
            kind: "promote",
            agent: o.dreamAgentId,
            count: 1,
            bytes: deltaBytes,
          });
        }
      }
      const pending = result.started ? 0 : pendingMaterial;
      applyIo(result.io, snap.memoryRoot, pending);
      setProfileUpdated(result.started && result.io.userMd !== beforeUser);
    } catch (e) {
      const failed: DreamIo = {
        ...io,
        state: { ...io.state, lastStatus: "failed", lastError: String(e), lockOwner: null },
      };
      await persistIo(failed, day).catch(() => undefined);
      applyIo(failed, snap.memoryRoot, 0);
    } finally {
      runningRef.current = false;
      if (acp.handle) await acp.handle.close().catch(() => undefined);
    }
  }, [applyIo]);

  const onDreamNow = useCallback(() => {
    void runSweep("manual");
  }, [runSweep]);

  useEffect(() => {
    void refreshFromHost().catch(() => undefined);
  }, [refreshFromHost]);

  useEffect(() => {
    if (!opts.settingsHydrated || catchUpTried.current) return;
    catchUpTried.current = true;
    void refreshFromHost().catch(() => undefined);
  }, [opts.settingsHydrated, refreshFromHost]);

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
    diary,
    status,
    corpus,
    userMd,
    tagline,
    userMdPath: memoryRoot ? userMdPathOf(memoryRoot) : "",
    dreamsMdPath: memoryRoot ? dreamsMdPath(memoryRoot) : "",
    memoryRoot,
    profileUpdated,
    dismissProfileUpdated: () => setProfileUpdated(false),
  };
}
