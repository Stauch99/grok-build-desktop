import type { AgentId } from "./agent-id";

export type SkillLinkFs = {
  exists(path: string): boolean;
  isSymlink(path: string): boolean;
  readlink(path: string): string;
  mkdirp(path: string): void;
  symlink(from: string, to: string): void;
  unlink(path: string): void;
};

export type SkillLinkResult = "linked" | "unlinked" | "conflict" | "kept" | "noop";

export function skillLinkDest(home: string, agentId: AgentId, name: string): string {
  const root = home.replace(/\/$/, "");
  const folder =
    agentId === "grok"
      ? ".grok/skills"
      : agentId === "kimi"
        ? ".kimi-code/skills"
        : agentId === "claude"
          ? ".claude/skills"
          : ".codex/skills";
  return `${root}/${folder}/${name}`;
}

function parentDir(destDir: string): string {
  const i = destDir.lastIndexOf("/");
  return i < 0 ? "." : destDir.slice(0, i);
}

export function applySkillLink(
  fs: SkillLinkFs,
  canonicalDir: string,
  destDir: string,
  enabled: boolean,
): SkillLinkResult {
  if (enabled) {
    if (!fs.exists(destDir)) {
      fs.mkdirp(parentDir(destDir));
      fs.symlink(canonicalDir, destDir);
      return "linked";
    }
    if (fs.isSymlink(destDir)) {
      if (fs.readlink(destDir) === canonicalDir) return "noop";
      fs.unlink(destDir);
      fs.symlink(canonicalDir, destDir);
      return "linked";
    }
    return "conflict";
  }
  if (!fs.exists(destDir)) return "noop";
  if (fs.isSymlink(destDir) && fs.readlink(destDir) === canonicalDir) {
    fs.unlink(destDir);
    return "unlinked";
  }
  return "kept";
}
