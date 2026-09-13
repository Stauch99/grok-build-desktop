import type { AgentId } from "./agent-id";
import { catalogFromSource } from "./agent-models";
import { memoryCursorKey } from "./memory-clock";
import {
  appendDreamsAppendix,
  dreamAlreadyRunning,
  FOUNDING_PROMPT_TIMEOUT_MS,
  foundingBootstrapPrompts,
  openDreamAcp,
  type DreamAcpHandle,
} from "./memory-dream-acp";
import type { DreamIo } from "./memory-dream";
import { clusterEpisodes, shouldFoundingOneShot } from "./memory-founding-cluster";
import { pickFoundingKimiModel } from "./memory-founding-model";
import { domainPrompt, foundingPrompt, mergePrompt } from "./memory-founding-prompt";
import { grokTurnsFromUpdates, type GrokIngestPage } from "./memory-grok-turns";
import { persistDreamFiles, persistState } from "./memory-host-persist";
import {
  clipDailyText,
  MEMORY_FILE_MAX_BYTES,
  parseDailyFile,
  utf8Bytes,
  type DailyLine,
} from "./memory-ingest";
import {
  FOUNDING_MAX_EPISODE_SHARDS,
  foundingDomainPath,
  foundingEpisodePath,
  skillProposalPath,
} from "./memory-paths";
import { parseMainOutput } from "./memory-phase-prompt";
import { proposalMarkdown } from "./memory-skill-proposal";
import type { MemoryState } from "./memory-state";
import { extractTeachLines } from "./memory-teach";
import { applyUserMdRewrite } from "./memory-validate";
import { readAgentModelSource } from "./workbench-api";

const GLOBAL_MEMORY_CLIP_BYTES = 4 * 1024;

export type FoundingRunInput = {
  io: DreamIo;
  memoryRoot: string;
  selectedAgentId: AgentId;
  doctors: readonly { agentId: AgentId; authPresent: boolean }[];
  skillNames: readonly string[];
  now: number;
  day: string;
  grokSkillsRoot: string;
  listPages: (io: DreamIo) => Promise<GrokIngestPage[]>;
  openAcp: typeof openDreamAcp;
  persistState: typeof persistState;
  persistDreamFiles: typeof persistDreamFiles;
  writeText: (path: string, text: string) => Promise<void>;
  readGlobalMemory?: () => Promise<string>;
  readKimiCatalog?: () => Promise<string[]>;
  readText?: (path: string) => Promise<string>;
};

function withState(io: DreamIo, patch: Partial<MemoryState>): DreamIo {
  return { ...io, state: { ...io.state, ...patch } };
}

function formatEpisodeLine(line: DailyLine): string {
  return `- [${line.agentId} | ${line.sessionId} | ${line.cwd} | ${line.kind}] ${clipDailyText(line.text)}\n`;
}

function episodeWeight(kind: DailyLine["kind"]): number {
  if (kind === "teach_episode") return 2;
  if (kind === "user_pref") return 1;
  return 0;
}

function packEpisodeShards(lines: readonly DailyLine[]): Record<number, string> | null {
  const shards: Record<number, string> = {};
  let index = 1;
  for (const line of lines) {
    const formatted = formatEpisodeLine(line);
    while (index <= FOUNDING_MAX_EPISODE_SHARDS) {
      const current = shards[index] ?? "";
      if (utf8Bytes(current + formatted) <= MEMORY_FILE_MAX_BYTES) break;
      index += 1;
    }
    if (index > FOUNDING_MAX_EPISODE_SHARDS) return null;
    shards[index] = (shards[index] ?? "") + formatted;
  }
  return shards;
}

function selectEpisodeLines(lines: DailyLine[]): DailyLine[] {
  if (packEpisodeShards(lines)) return lines;
  const ranked = lines
    .map((line, i) => ({ line, i }))
    .sort((a, b) => episodeWeight(b.line.kind) - episodeWeight(a.line.kind) || a.i - b.i);
  let lo = 0;
  let hi = ranked.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const subset = ranked
      .slice(0, mid)
      .sort((a, b) => a.i - b.i)
      .map((row) => row.line);
    if (packEpisodeShards(subset)) lo = mid;
    else hi = mid - 1;
  }
  return ranked
    .slice(0, lo)
    .sort((a, b) => a.i - b.i)
    .map((row) => row.line);
}

function clipUtf8(text: string, maxBytes: number): string {
  if (utf8Bytes(text) <= maxBytes) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (utf8Bytes(text.slice(0, mid)) <= maxBytes) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo);
}

async function defaultKimiCatalog(): Promise<string[]> {
  const source = await readAgentModelSource("kimi");
  const catalog = catalogFromSource(source);
  const ids = catalog.models.map((m) => m.id);
  if (catalog.currentModel) ids.push(catalog.currentModel);
  return ids;
}

function failFounding(io: DreamIo, error: string, restoreUser?: string): DreamIo {
  return withState(
    restoreUser != null ? { ...io, userMd: restoreUser } : io,
    {
      foundingStatus: "failed",
      foundingError: error,
      lockOwner: null,
      lastStatus: "failed",
      lastError: error,
    },
  );
}

async function promptQuiet(handle: DreamAcpHandle, text: string): Promise<string> {
  try {
    return await handle.prompt(text);
  } catch {
    return "";
  }
}

export async function runFoundingDream(input: FoundingRunInput): Promise<{ io: DreamIo; error?: string }> {
  let io = { ...input.io, state: { ...input.io.state } };
  const firstFounding = io.state.foundingAt == null;
  const originalUser = io.userMd;

  if (io.state.lockOwner || io.state.lastStatus === "running" || io.state.foundingStatus === "running") {
    return { io, error: "lock" };
  }
  if (!input.doctors.some((d) => d.agentId === "kimi" && d.authPresent)) {
    io = withState(io, { foundingStatus: "failed", foundingError: "kimi-login" });
    await input.persistState(io.state).catch(() => undefined);
    return { io, error: "kimi-login" };
  }

  const catalogIds = input.readKimiCatalog ? await input.readKimiCatalog() : await defaultKimiCatalog();
  const modelId = pickFoundingKimiModel(catalogIds);
  if (!modelId) {
    io = withState(io, { foundingStatus: "failed", foundingError: "k3" });
    await input.persistState(io.state).catch(() => undefined);
    return { io, error: "k3" };
  }

  io = withState(io, {
    foundingStatus: "running",
    foundingError: null,
    lockOwner: "dream",
    lastStatus: "running",
    lastError: null,
  });
  await input.persistState(io.state);

  let handle: DreamAcpHandle | null = null;
  try {
    const pages = await input.listPages(io);
    const collected: DailyLine[] = [];
    let pageIndex = 0;
    for (const page of pages) {
      if (io.state.forgotten.includes(page.sessionId)) continue;
      const agentId = page.agentId ?? "grok";
      const turns = grokTurnsFromUpdates(page.rows, {
        agentId,
        sessionId: page.sessionId,
        cwd: page.cwd,
      });
      collected.push(...extractTeachLines(turns, io.state.forgotten));
      io = withState(io, {
        foundingCursors: {
          ...io.state.foundingCursors,
          [memoryCursorKey(agentId, page.sessionId)]: page.nextByte,
        },
      });
      pageIndex += 1;
      if (pageIndex % 3 === 0) await input.persistState(io.state);
    }
    await input.persistState(io.state);

    const selected = selectEpisodeLines(collected);
    const shards = packEpisodeShards(selected) ?? {};
    const writeQuiet = async (path: string, text: string) => {
      try {
        await input.writeText(path, text);
      } catch {
        /* memory-host files are resume aids; the in-memory prompt still proceeds */
      }
    };
    for (const key of Object.keys(shards)) {
      const index = Number(key);
      const text = shards[index];
      if (!text) continue;
      await writeQuiet(foundingEpisodePath(input.memoryRoot, index), text);
    }

    const packed = Object.keys(shards)
      .map(Number)
      .sort((a, b) => a - b)
      .map((index) => shards[index] ?? "")
      .join("");

    const memoryClip = clipUtf8((await input.readGlobalMemory?.().catch(() => "")) ?? "", GLOBAL_MEMORY_CLIP_BYTES);

    handle = await input.openAcp({
      agentId: "kimi",
      memoryRoot: input.memoryRoot,
      alreadyRunning: dreamAlreadyRunning(input.selectedAgentId, "kimi"),
      promptTimeoutMs: FOUNDING_PROMPT_TIMEOUT_MS,
    });
    for (const slash of foundingBootstrapPrompts(modelId)) {
      await promptQuiet(handle, slash);
    }

    let mainText: string;
    if (shouldFoundingOneShot(packed.length)) {
      mainText = await handle.prompt(
        foundingPrompt({
          episodes: packed.trim() || "(none)",
          userMd: io.userMd,
          skillNames: input.skillNames,
          memoryClip,
          day: input.day,
        }),
      );
    } else {
      const lines = selected.length ? selected : Object.values(shards).flatMap((text) => parseDailyFile(text));
      const clusters = clusterEpisodes(lines);
      const notes: string[] = [];
      for (const cluster of clusters) {
        const path = foundingDomainPath(input.memoryRoot, cluster.domain);
        if (io.state.foundingDomainsDone.includes(cluster.domain)) {
          const existing = input.readText ? await input.readText(path).catch(() => "") : "";
          if (existing) notes.push(existing);
          continue;
        }
        const episodeText = cluster.lines.map((line) => formatEpisodeLine(line).trimEnd()).join("\n");
        const domainText = await handle.prompt(
          domainPrompt({ domain: cluster.domain, episodes: episodeText, skillNames: input.skillNames }),
        );
        const parsedDomain = parseMainOutput(domainText);
        const body = parsedDomain.diary ?? domainText;
        await writeQuiet(path, body);
        notes.push(body);
        io = withState(io, { foundingDomainsDone: [...io.state.foundingDomainsDone, cluster.domain] });
        await input.persistState(io.state);
      }
      mainText = await handle.prompt(
        mergePrompt({
          domainNotes: notes.join("\n\n").trim() || "(none)",
          userMd: io.userMd,
          skillNames: input.skillNames,
          memoryClip,
          day: input.day,
        }),
      );
    }

    const parsed = parseMainOutput(mainText);
    if (parsed.userMd != null) {
      const applied = applyUserMdRewrite(io.userMd, parsed.userMd, { skipLoss: firstFounding });
      if (applied.rejected) {
        io = failFounding(io, "user", originalUser);
        await input.persistState(io.state);
        return { io, error: "user" };
      }
      io = { ...io, userMd: applied.file, state: { ...io.state, userMdPreimage: applied.preimage } };
    }

    if (parsed.diary) {
      const nextDreams = appendDreamsAppendix(io.dreamsMd, parsed.diary);
      if (utf8Bytes(nextDreams) > MEMORY_FILE_MAX_BYTES) {
        io = failFounding(io, "diary-budget", originalUser);
        await input.persistState(io.state);
        return { io, error: "diary-budget" };
      }
      io = { ...io, dreamsMd: nextDreams };
    }

    for (const stub of parsed.skills) {
      if (stub.action === "noop") continue;
      const md = proposalMarkdown({ ...stub, status: "pending", source: "founding" });
      if (!md) continue;
      await writeQuiet(skillProposalPath(input.memoryRoot, stub.id), md);
    }

    io = withState(io, {
      foundingAt: input.now,
      foundingStatus: "ok",
      foundingError: null,
      foundingModelId: modelId,
      lockOwner: null,
      lastStatus: "ok",
      lastError: null,
    });
    if (parsed.tagline) {
      io = withState(io, { tagline: parsed.tagline, taglineAt: input.now });
    }
    await input.persistDreamFiles({ userMd: io.userMd, dreamsMd: io.dreamsMd, state: io.state });
    await input.persistState(io.state);
    return { io };
  } catch (e) {
    io = failFounding(io, String(e), originalUser);
    await input.persistState(io.state).catch(() => undefined);
    return { io, error: String(e) };
  } finally {
    if (handle) await handle.close().catch(() => undefined);
  }
}
