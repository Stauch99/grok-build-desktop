import { describe, expect, it } from "vitest";
import {
  applyProposalDecision,
  parseProposalMarkdown,
  proposalMarkdown,
  skillMarkdownFromProposal,
  type SkillProposal,
} from "./memory-skill-proposal";

const pending: SkillProposal = {
  action: "create",
  id: "scheme-pdf",
  title: "升学方案",
  target: "",
  evidence: "s1",
  summary: "先框架再 PDF",
  status: "pending",
  source: "founding",
};

describe("skill proposals", () => {
  it("round-trips a pending proposal", () => {
    const md = proposalMarkdown(pending);
    expect(md).toBeTruthy();
    expect(parseProposalMarkdown(md!)).toEqual(pending);
  });

  it("skips noop files", () => {
    expect(proposalMarkdown({ ...pending, action: "noop" })).toBe(null);
  });

  it("approve produces a SKILL.md body; dismiss only flips status", () => {
    const approved = applyProposalDecision(pending, "approved");
    expect(approved.status).toBe("approved");
    expect(skillMarkdownFromProposal(approved)).toContain("升学方案");
    expect(skillMarkdownFromProposal(approved)).toContain("先框架再 PDF");
    expect(applyProposalDecision(pending, "dismissed").status).toBe("dismissed");
  });
});
