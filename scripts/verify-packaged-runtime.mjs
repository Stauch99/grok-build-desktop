import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const grokBin = join(homedir(), ".grok", "bin", "grok");
const ok = existsSync(grokBin);
if (!ok && process.env.VERIFY_GROK_BIN === "1") {
  console.error(`missing grok runtime: ${grokBin}`);
  process.exit(1);
}
if (!ok) {
  console.warn(`grok binary not found at ${grokBin} (set VERIFY_GROK_BIN=1 to fail)`);
  process.exit(0);
}
console.log(`grok runtime ok: ${grokBin}`);
