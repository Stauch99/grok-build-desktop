import { describe, expect, it } from "vitest";
import { recordLocalEvent, readLocalEvents, resetLocalEvents, type TelemetryStore } from "./telemetry";

function mem(): TelemetryStore {
  const data: Record<string, string> = {};
  return {
    get: (k) => data[k],
    set: (k, v) => {
      data[k] = String(v);
    },
  };
}

describe("local telemetry", () => {
  it("does not record when opt-in is off", () => {
    const store = mem();
    recordLocalEvent(false, "hotkey.palette", store);
    expect(readLocalEvents(store)).toEqual({});
  });

  it("counts events only after opt-in", () => {
    const store = mem();
    resetLocalEvents(store);
    recordLocalEvent(true, "hotkey.palette", store);
    recordLocalEvent(true, "hotkey.palette", store);
    recordLocalEvent(true, "mode.yolo", store);
    expect(readLocalEvents(store)).toEqual({ "hotkey.palette": 2, "mode.yolo": 1 });
  });
});
