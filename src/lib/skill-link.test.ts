import { describe, expect, it } from "vitest";
import { applySkillLink, skillLinkDest, type SkillLinkFs } from "./skill-link";

function memFs(init: Record<string, { link?: string } | true> = {}): SkillLinkFs & {
  nodes: Record<string, { link?: string } | true>;
} {
  const nodes = { ...init };
  return {
    nodes,
    exists: (p) => p in nodes,
    isSymlink: (p) => typeof nodes[p] === "object" && !!nodes[p]?.link,
    readlink: (p) => {
      const n = nodes[p];
      if (typeof n === "object" && n.link) return n.link;
      throw new Error(`not a symlink: ${p}`);
    },
    mkdirp: () => {},
    symlink: (from, to) => {
      nodes[to] = { link: from };
    },
    unlink: (p) => {
      delete nodes[p];
    },
  };
}

describe("skillLinkDest", () => {
  it("maps each CLI to its native skills folder", () => {
    const home = "/Users/me/";
    expect(skillLinkDest(home, "grok", "pdf")).toBe("/Users/me/.grok/skills/pdf");
    expect(skillLinkDest(home, "kimi", "pdf")).toBe("/Users/me/.kimi-code/skills/pdf");
    expect(skillLinkDest(home, "claude", "pdf")).toBe("/Users/me/.claude/skills/pdf");
    expect(skillLinkDest(home, "codex", "pdf")).toBe("/Users/me/.codex/skills/pdf");
  });
});

describe("applySkillLink", () => {
  const canonical = "/Users/me/.agents/skills/pdf";
  const dest = "/Users/me/.claude/skills/pdf";

  it("links when enabled and dest is free", () => {
    const fs = memFs();
    expect(applySkillLink(fs, canonical, dest, true)).toBe("linked");
    expect(fs.nodes[dest]).toEqual({ link: canonical });
  });

  it("is noop when the symlink already points at canonical", () => {
    const fs = memFs({ [dest]: { link: canonical } });
    expect(applySkillLink(fs, canonical, dest, true)).toBe("noop");
  });

  it("replaces a stale symlink", () => {
    const fs = memFs({ [dest]: { link: "/old/pdf" } });
    expect(applySkillLink(fs, canonical, dest, true)).toBe("linked");
    expect(fs.nodes[dest]).toEqual({ link: canonical });
  });

  it("refuses to overwrite a real skill folder", () => {
    const fs = memFs({ [dest]: true });
    expect(applySkillLink(fs, canonical, dest, true)).toBe("conflict");
    expect(fs.nodes[dest]).toBe(true);
  });

  it("unlinks only our symlink when disabled", () => {
    const ours = memFs({ [dest]: { link: canonical } });
    expect(applySkillLink(ours, canonical, dest, false)).toBe("unlinked");
    expect(ours.exists(dest)).toBe(false);

    const foreign = memFs({ [dest]: { link: "/other" } });
    expect(applySkillLink(foreign, canonical, dest, false)).toBe("kept");
    expect(foreign.exists(dest)).toBe(true);

    const real = memFs({ [dest]: true });
    expect(applySkillLink(real, canonical, dest, false)).toBe("kept");

    const missing = memFs();
    expect(applySkillLink(missing, canonical, dest, false)).toBe("noop");
  });
});
