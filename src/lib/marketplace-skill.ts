import { skillDir, skillNameOk } from "./agents-store";

export function skillFolderName(sourcePath: string): string | null {
  const trimmed = sourcePath.replace(/\/+$/, "");
  const base = trimmed.split("/").pop() ?? "";
  if (!skillNameOk(base)) return null;
  return base;
}

export function marketplaceInstallDest(agentsHome: string, name: string): string {
  return skillDir(agentsHome, name);
}

export function marketplaceInstallBlocked(destExists: boolean): boolean {
  return destExists;
}
