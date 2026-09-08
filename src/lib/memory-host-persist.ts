import type { MemoryHostPatch } from "../api";
import { MEMORY_FILE_MAX_BYTES, utf8Bytes } from "./memory-ingest";
import { DAILY_MAX_SHARDS } from "./memory-paths";
import type { MemoryState } from "./memory-state";

export type MemoryHostWrite = (patch: MemoryHostPatch) => Promise<void>;

export type PersistWriteOpts = { write?: MemoryHostWrite };

async function hostWrite(write: MemoryHostWrite | undefined, patch: MemoryHostPatch): Promise<void> {
  if (write) {
    await write(patch);
    return;
  }
  const { writeMemoryHost } = await import("../api");
  await writeMemoryHost(patch);
}

function shardIndexes(shards: Record<number, string>): number[] {
  return Object.keys(shards)
    .map(Number)
    .filter((index) => Number.isInteger(index) && index >= 1 && index <= DAILY_MAX_SHARDS)
    .sort((a, b) => a - b);
}

export async function persistState(state: MemoryState, opts?: PersistWriteOpts): Promise<{ stateJson: string }> {
  const stateJson = JSON.stringify(state);
  await hostWrite(opts?.write, { stateJson });
  return { stateJson };
}

export async function persistDailyShards(
  day: string,
  shards: Record<number, string>,
  opts?: PersistWriteOpts,
): Promise<void> {
  for (const dailyShard of shardIndexes(shards)) {
    const dailyMd = shards[dailyShard];
    if (dailyMd == null) continue;
    if (utf8Bytes(dailyMd) > MEMORY_FILE_MAX_BYTES) {
      throw new Error("file exceeds 64 KiB size limit");
    }
    await hostWrite(opts?.write, { dailyMd, dailyDay: day, dailyShard });
  }
}

export async function persistDreamFiles(
  input: { userMd: string; dreamsMd: string; state: MemoryState },
  opts?: PersistWriteOpts,
): Promise<void> {
  const patch: MemoryHostPatch = {
    dreamsMd: input.dreamsMd,
    stateJson: JSON.stringify(input.state),
  };
  if (input.userMd.trim()) patch.userMd = input.userMd;
  await hostWrite(opts?.write, patch);
}

export async function persistIngest(input: {
  write?: MemoryHostWrite;
  day: string;
  shards: Record<number, string>;
  state: MemoryState;
}): Promise<void> {
  const opts = { write: input.write };
  try {
    await persistDailyShards(input.day, input.shards, opts);
  } catch {
    await persistState(input.state, opts);
    return;
  }
  await persistState(input.state, opts);
}
