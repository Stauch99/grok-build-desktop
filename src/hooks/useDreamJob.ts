import { useCallback, useEffect, useRef, useState } from "react";
import {
  listSessions,
  readMemoryHost,
  readSessionUpdates,
  readTextFile,
  writeMemoryHost,
  type MemoryHostSnapshot,
} from "../api";
import type { AgentDoctor } from "../lib/agent-doctor";
import type { AgentId } from "../lib/agent-id";
import { t, type Locale } from "../lib/i18n";
import { memoryCursorKey, localDayStamp } from "../lib/memory-clock";
import { evaluateDreamGates, type DreamTrigger } from "../lib/memory-gates";
import { parseDailyFile } from "../lib/memory-ingest";
import { appendDreamsAppendix, dreamAlreadyRunning, loggedInAgentIds, openDreamAcp } from "../lib/memory-dream-acp";
import { runDreamSweep, type DreamIo } from "../lib/memory-dream";
import { applyGrokIngest } from "../lib/memory-grok-turns";
import { dailyMdPath, userMdPath as userMdPathOf } from "../lib/memory-paths";
import { phasePrompt } from "../lib/memory-phase-prompt";
import { armRecurringLocalHour, shouldCatchUp } from "../lib/memory-schedule";
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
  showToast: (msg: string) => void;
};

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

async function ingestGrok(io: DreamIo, day: string): Promise<DreamIo> {
  const sessions = brandSessionList(await listSessions(null));
  const pages = [];
  for (const s of sessions) {
    if (s.agentId !== "grok") continue;
    if (io.state.forgotten.includes(s.id)) continue;
    const after = io.state.cursors[memoryCursorKey("grok", s.id)] ?? 0;
    const page = await readSessionUpdates(s.id, after);
    pages.push({ sessionId: s.id, cwd: s.cwd, rows: page.rows, nextByte: page.nextByte });
  }
  const next = applyGrokIngest(io, pages, day);
  Object.assign(io.state.cursors, next.io.state.cursors);
  return { ...io, dailyMd: next.io.dailyMd };
}

export function useDreamJob(opts: DreamJobOpts) {
  const [diary, setDiary] = useState<DiaryEntry[]>([]);
  const [status, setStatus] = useState<OverlayStatus>({ kind: "idle", lastAt: null });
  const [corpus, setCorpus] = useState<string | null>(null);
  const [userMd, setUserMd] = useState<string | null>(null);
  const [memoryRoot, setMemoryRoot] = useState("");
  const [profileUpdated, setProfileUpdated] = useState(false);
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
  }, []);

  const refreshFromHost = useCallback(async () => {
    const now = Date.now();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const day = localDayStamp(now, tz);
    const snap = await readMemoryHost();
    const io = await ioFromHost(snap, day);
    const pending = shouldCatchUp({ now, lastDeepAt: io.state.lastDeepAt, timeZone: tz }) ? 1 : 0;
    applyIo(io, snap.memoryRoot, pending);
    return { snap, io, now, tz, day, pending };
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
      o.showToast(String(e));
      return;
    }
    const lockHeld = !!io.state.lockOwner;
    if (trigger === "manual") {
      const gate = evaluateDreamGates({
        enabled: o.enabled,
        now,
        lastDeepAt: io.state.lastDeepAt,
        lastScanAt: io.state.lastScanAt,
        newSessionCount: 0,
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
    runningRef.current = true;
    setStatus({ kind: "running" });
    const beforeUser = io.userMd;
    const acp = { handle: null as Awaited<ReturnType<typeof openDreamAcp>> | null };
    try {
      const result = await runDreamSweep({
        trigger,
        enabled: o.enabled,
        now,
        newSessionCount: trigger === "manual" ? 0 : 1,
        dreamAgentId: o.dreamAgentId,
        loggedIn,
        io,
        runPhase: async (phase, current) => {
          let next = current;
          if (phase === "light") next = await ingestGrok(current, day);
          if (!acp.handle) {
            acp.handle = await openDreamAcp({
              agentId: o.dreamAgentId,
              memoryRoot: snap.memoryRoot,
              alreadyRunning: dreamAlreadyRunning(o.selectedAgentId, o.dreamAgentId),
            });
          }
          const text = await acp.handle.prompt(phasePrompt(phase, next));
          if (phase === "light") return { dailyMd: text.trim() ? text : next.dailyMd };
          if (phase === "rem") return { dreamsMd: appendDreamsAppendix(next.dreamsMd, text) };
          return { userMd: text };
        },
      });
      await persistIo(result.io, day);
      const pending = result.started ? 0 : shouldCatchUp({ now, lastDeepAt: result.io.state.lastDeepAt, timeZone: tz }) ? 1 : 0;
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
    void (async () => {
      try {
        const loaded = await refreshFromHost();
        if (!optsRef.current.enabled) return;
        const gate = evaluateDreamGates({
          enabled: optsRef.current.enabled,
          now: loaded.now,
          lastDeepAt: loaded.io.state.lastDeepAt,
          lastScanAt: loaded.io.state.lastScanAt,
          newSessionCount: 1,
          lockHeld: !!loaded.io.state.lockOwner,
          trigger: "launch",
        });
        if (shouldCatchUp({ now: loaded.now, lastDeepAt: loaded.io.state.lastDeepAt, timeZone: loaded.tz }) && gate.ok) {
          await runSweep("launch");
        }
      } catch {
        /* overlay already best-effort */
      }
    })();
  }, [opts.settingsHydrated, refreshFromHost, runSweep]);

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
    userMdPath: memoryRoot ? userMdPathOf(memoryRoot) : "",
    profileUpdated,
    dismissProfileUpdated: () => setProfileUpdated(false),
  };
}
