import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  composerInboxDepth,
  pushComposerDraft,
  registerComposerInbox,
  resetComposerInbox,
} from "./composer-inbox";

describe("composer-inbox", () => {
  beforeEach(() => resetComposerInbox());

  it("returns false when nothing is registered", () => {
    expect(pushComposerDraft("hello")).toBe(false);
    expect(composerInboxDepth()).toBe(0);
  });

  it("delivers to the most recently registered handler", () => {
    const a = vi.fn();
    const b = vi.fn();
    registerComposerInbox(a);
    registerComposerInbox(b);
    expect(pushComposerDraft("draft")).toBe(true);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith("draft");
  });

  it("falls back to the previous composer when the top one unregisters", () => {
    const a = vi.fn();
    const b = vi.fn();
    registerComposerInbox(a);
    const unregB = registerComposerInbox(b);
    unregB();
    expect(pushComposerDraft("back")).toBe(true);
    expect(a).toHaveBeenCalledWith("back");
    expect(b).not.toHaveBeenCalled();
  });

  it("re-registering the same handler moves it to the top without duplicating", () => {
    const a = vi.fn();
    const b = vi.fn();
    registerComposerInbox(a);
    registerComposerInbox(b);
    registerComposerInbox(a);
    expect(composerInboxDepth()).toBe(2);
    expect(pushComposerDraft("x")).toBe(true);
    expect(a).toHaveBeenCalledWith("x");
    expect(b).not.toHaveBeenCalled();
  });

  it("unregister is idempotent and returns false once empty", () => {
    const a = vi.fn();
    const unreg = registerComposerInbox(a);
    unreg();
    unreg();
    expect(composerInboxDepth()).toBe(0);
    expect(pushComposerDraft("nope")).toBe(false);
  });
});
