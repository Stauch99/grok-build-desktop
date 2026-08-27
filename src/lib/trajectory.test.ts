import { describe, expect, it } from "vitest";
import { trajectoryRows } from "./trajectory";
import type { ChatItem } from "./chat";

describe("trajectoryRows", () => {
  it("flattens chat items into a read-only ledger", () => {
    const items: ChatItem[] = [
      { kind: "user", id: "u1", text: "hello world" },
      { kind: "tool", id: "t1", title: "read App.tsx", status: "completed" },
      { kind: "assistant", id: "a1", text: "ok" },
    ];
    expect(trajectoryRows(items)).toEqual([
      { id: "u1", kind: "user", label: "hello world" },
      { id: "t1", kind: "tool", label: "read App.tsx" },
      { id: "a1", kind: "assistant", label: "ok" },
    ]);
  });
});
