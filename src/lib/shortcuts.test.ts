import { describe, expect, it } from "vitest";
import { digitFromEvent, isMod, isMruSwitch } from "./shortcuts";

describe("isMod", () => {
  it("is true for meta or ctrl", () => {
    expect(isMod({ metaKey: true, ctrlKey: false })).toBe(true);
    expect(isMod({ metaKey: false, ctrlKey: true })).toBe(true);
    expect(isMod({ metaKey: true, ctrlKey: true })).toBe(true);
  });

  it("is false when neither is held", () => {
    expect(isMod({ metaKey: false, ctrlKey: false })).toBe(false);
  });
});

describe("digitFromEvent", () => {
  it("reads key 1-9", () => {
    expect(digitFromEvent({ key: "1" })).toBe(1);
    expect(digitFromEvent({ key: "9" })).toBe(9);
  });

  it("reads DigitN code when key is not a digit", () => {
    expect(digitFromEvent({ key: "!", code: "Digit1" })).toBe(1);
    expect(digitFromEvent({ key: "Unidentified", code: "Digit5" })).toBe(5);
  });

  it("returns null for 0 and non-digits", () => {
    expect(digitFromEvent({ key: "0" })).toBe(null);
    expect(digitFromEvent({ key: "a", code: "KeyA" })).toBe(null);
    expect(digitFromEvent({ key: "Tab" })).toBe(null);
    expect(digitFromEvent({ key: "0", code: "Digit0" })).toBe(null);
  });
});

describe("isMruSwitch", () => {
  it("matches Ctrl+Tab only", () => {
    expect(isMruSwitch({ key: "Tab", ctrlKey: true, metaKey: false })).toBe(true);
  });

  it("rejects Meta+Tab and bare Tab", () => {
    expect(isMruSwitch({ key: "Tab", ctrlKey: false, metaKey: true })).toBe(false);
    expect(isMruSwitch({ key: "Tab", ctrlKey: true, metaKey: true })).toBe(false);
    expect(isMruSwitch({ key: "Tab", ctrlKey: false, metaKey: false })).toBe(false);
  });

  it("rejects other keys with Ctrl", () => {
    expect(isMruSwitch({ key: "1", ctrlKey: true, metaKey: false })).toBe(false);
  });
});
