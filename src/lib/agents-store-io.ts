import { parseMcpJson, stringifyMcpJson, type McpServer } from "./agents-store";
import { firstOpenMcpImport } from "./mcp-live";

export type StoreFs = {
  read(path: string): string | null;
  write(path: string, text: string): void;
  exists(path: string): boolean;
};

export function loadOrInitMcpJson(
  fs: StoreFs,
  mcpPath: string,
  liveImports: McpServer[],
): { catalog: McpServer[]; conflicts: string[] } {
  let canonical: McpServer[] = [];
  const raw = fs.read(mcpPath);
  if (raw !== null) {
    try {
      canonical = parseMcpJson(JSON.parse(raw));
    } catch {
      canonical = [];
    }
  }
  const next = firstOpenMcpImport(canonical, liveImports);
  fs.write(mcpPath, stringifyMcpJson(next.catalog));
  return { catalog: next.catalog, conflicts: next.conflicts };
}
