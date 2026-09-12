import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const host = process.env.TAURI_DEV_HOST;

// mermaid is only reached through `import("mermaid")` (src/lib/mermaid-once.ts).
// Modules named by manualChunks merge into that chunk even when their only
// importer is dynamic, so the catch-all vendor bucket must skip mermaid's whole
// dependency closure (d3, cytoscape, katex, …) to keep it lazily loaded.
function depClosure(root: string): Set<string> {
  const seen = new Set<string>();
  const queue = [root];
  while (queue.length) {
    const name = queue.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    try {
      const pkg = JSON.parse(
        readFileSync(
          fileURLToPath(new URL(`./node_modules/${name}/package.json`, import.meta.url)),
          "utf8",
        ),
      ) as { dependencies?: Record<string, string> };
      queue.push(...Object.keys(pkg.dependencies ?? {}));
    } catch {
      // Unresolvable or unreadable package.json — nothing to descend into.
    }
  }
  return seen;
}

const mermaidGraph = depClosure("mermaid");

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          const m = /node_modules[/\\]((?:@[^/\\]+[/\\])?[^/\\]+)/.exec(id);
          if (!m) return;
          const pkg = m[1].replace(/\\/g, "/");
          if (pkg === "react" || pkg === "react-dom" || pkg === "scheduler") return "react";
          if (pkg === "marked" || pkg === "dompurify") return "markdown";
          if (pkg === "@tabler/icons-react") return "icons";
          if (mermaidGraph.has(pkg)) return; // stays an async chunk
          return "vendor";
        },
      },
    },
  },
});
