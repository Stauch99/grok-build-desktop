import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** CSS files loaded by `src/main.tsx`, in order. */
export const APP_STYLE_FILES = [
  "src/styles/tokens.css",
  "src/styles.css",
  "src/styles/shell.css",
  "src/styles/overlays.css",
  "src/styles/panes.css",
  "src/styles/palette.css",
  "src/styles/workspace.css",
  "src/styles/usage.css",
  "src/styles/hub.css",
  "src/styles/extras.css",
  "src/styles/sidebar.css",
  "src/styles/thread.css",
  "src/styles/composer.css",
  "src/styles/settings.css",
  "src/styles/review.css",
] as const;

export function cssFile(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

export function appCss(): string {
  return APP_STYLE_FILES.map((rel) => cssFile(rel)).join("\n");
}
