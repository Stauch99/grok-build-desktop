import type { SkillStub } from "./memory-phase-prompt";

export type SkillProposal = SkillStub & {
  status: "pending" | "approved" | "dismissed";
  source: "founding" | "nightly";
};

export function proposalMarkdown(p: SkillProposal): string | null {
  if (p.action === "noop") return null;
  return [
    "---",
    `action: ${p.action}`,
    `id: ${p.id}`,
    `title: ${p.title}`,
    `target: ${p.target}`,
    `status: ${p.status}`,
    `evidence: ${p.evidence}`,
    `source: ${p.source}`,
    "---",
    "",
    p.summary.trim(),
    "",
  ].join("\n");
}

export function parseProposalMarkdown(text: string): SkillProposal | null {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const fields: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const row = line.match(/^(action|id|title|target|status|evidence|source)\s*:\s*(.*)$/);
    if (row) fields[row[1]] = row[2].trim();
  }
  const action = fields.action;
  const status = fields.status;
  const source = fields.source;
  const id = fields.id?.trim() ?? "";
  if (!id) return null;
  if (action !== "create" && action !== "patch" && action !== "noop") return null;
  if (status !== "pending" && status !== "approved" && status !== "dismissed") return null;
  if (source !== "founding" && source !== "nightly") return null;
  return {
    action,
    id,
    title: fields.title ?? "",
    target: fields.target ?? "",
    evidence: fields.evidence ?? "",
    summary: m[2].trim(),
    status,
    source,
  };
}

export function applyProposalDecision(
  p: SkillProposal,
  decision: "approved" | "dismissed",
): SkillProposal {
  return { ...p, status: decision };
}

export function skillMarkdownFromProposal(p: SkillProposal): string {
  return [`# ${p.title || p.id}`, "", p.summary.trim(), ""].join("\n");
}
