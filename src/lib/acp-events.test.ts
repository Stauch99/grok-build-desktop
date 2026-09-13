import { describe, expect, it } from "vitest";
import { parseAcpRecord } from "./acp-events";

describe("parseAcpRecord", () => {
  it("returns null on non-objects", () => {
    expect(parseAcpRecord(null)).toBeNull();
    expect(parseAcpRecord(undefined)).toBeNull();
    expect(parseAcpRecord("session/update")).toBeNull();
    expect(parseAcpRecord(12)).toBeNull();
    expect(parseAcpRecord(true)).toBeNull();
    expect(parseAcpRecord(["tool_call"])).toBeNull();
  });

  it("returns an AcpRecord for a session update envelope", () => {
    const raw = {
      update: { sessionUpdate: "agent_message_chunk", content: { text: "hi" } },
      _ts: 1000,
    };
    expect(parseAcpRecord(raw)).toMatchObject({
      update: { sessionUpdate: "agent_message_chunk" },
      _ts: 1000,
    });
  });

  it("keeps params-wrapped disk rows", () => {
    const raw = {
      method: "session/update",
      params: { update: { sessionUpdate: "tool_call", toolCallId: "c1" } },
    };
    expect(parseAcpRecord(raw)).toMatchObject({
      method: "session/update",
      params: { update: { sessionUpdate: "tool_call", toolCallId: "c1" } },
    });
  });
});
