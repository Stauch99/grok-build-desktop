import { describe, expect, it } from "vitest";
import { unwrapAcpEvent, wrapAcpEvent } from "./acp-event-tag";

describe("wrapAcpEvent", () => {
  it("builds the host envelope", () => {
    const payload = { jsonrpc: "2.0", method: "session/update" };
    expect(wrapAcpEvent("claude", 3, payload)).toEqual({
      agentId: "claude",
      generation: 3,
      payload,
    });
  });
});

describe("unwrapAcpEvent", () => {
  it("reads a tagged envelope", () => {
    const payload = { jsonrpc: "2.0", id: 1, result: {} };
    expect(unwrapAcpEvent({ agentId: "kimi", generation: 2, payload })).toEqual({
      agentId: "kimi",
      generation: 2,
      payload,
    });
  });

  it("treats a bare JSON-RPC body as grok", () => {
    const raw = { jsonrpc: "2.0", method: "session/update" };
    expect(unwrapAcpEvent(raw)).toEqual({ agentId: "grok", generation: 0, payload: raw });
  });

  it("rejects unknown agentId and missing payload", () => {
    expect(unwrapAcpEvent({ agentId: "gemini", payload: {} })).toEqual({
      agentId: "grok",
      generation: 0,
      payload: { agentId: "gemini", payload: {} },
    });
    expect(unwrapAcpEvent({ agentId: "claude", generation: 1 })).toEqual({
      agentId: "grok",
      generation: 0,
      payload: { agentId: "claude", generation: 1 },
    });
  });

  it("defaults a non-number generation to 0", () => {
    expect(unwrapAcpEvent({ agentId: "codex", generation: "9", payload: 1 })).toEqual({
      agentId: "codex",
      generation: 0,
      payload: 1,
    });
  });
});
