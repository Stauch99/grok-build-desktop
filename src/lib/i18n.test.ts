import { describe, expect, it } from "vitest";
import {
  EN,
  LOCALE_CHOICES,
  ZH,
  fallbackCopy,
  isDangerousTrustPath,
  localeSearchHay,
  normalizeLocale,
  t,
} from "./i18n";

describe("i18n", () => {
  it("returns zh and en hub titles", () => {
    expect(t("zh", "hub.title")).toBe("扩展中心");
    expect(t("zh", "settings.extensions")).toBe("扩展中心");
    expect(t("zh", "settings.railChanges")).toBe("Git");
    expect(t("en", "hub.title")).toBe("Extensions");
    expect(t("en", "settings.railChanges")).toBe("Git");
  });

  it("falls back to the key", () => {
    expect(t("zh", "missing.thing")).toBe("missing.thing");
  });

  it("normalizes locale", () => {
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("zh")).toBe("zh");
    expect(normalizeLocale("de")).toBe("zh");
  });

  it("keeps ZH and EN key-parity", () => {
    expect(Object.keys(ZH).sort()).toEqual(Object.keys(EN).sort());
  });

  it("has user-memory settings copy", () => {
    expect(t("zh", "settings.injectUserMemory")).toBe("用户画像注入");
    expect(t("en", "settings.dreamAgentId")).toBe("Dream with");
    expect(t("zh", "memory.loadedChip")).toBe("已加载记忆");
    expect(t("en", "memory.loadedChip")).toBe("Memory loaded");
    expect(t("zh", "memory.dismissChip")).toBe("关闭");
    expect(t("en", "memory.dismissChip")).toBe("Dismiss");
  });

  it("differs on at least 20 chrome keys", () => {
    const differed = Object.keys(ZH).filter((key) => t("en", key) !== t("zh", key));
    expect(differed.length).toBeGreaterThanOrEqual(20);
  });

  it("covers sidebar composer gitbar thread settings chrome", () => {
    const prefixes = ["sidebar.", "composer.", "git.", "thread.", "settings."];
    for (const prefix of prefixes) {
      expect(Object.keys(ZH).some((key) => key.startsWith(prefix))).toBe(true);
    }
    expect(t("zh", "error.title")).toBe("出了点问题");
    expect(t("en", "error.title")).toBe("Something went wrong");
    expect(t("zh", "perm.remember")).toBe("此会话内记住");
    expect(t("zh", "perm.allowOnce")).toBe("允许这次");
    expect(t("zh", "trust.danger")).toBe("这是危险目录");
  });

  it("interpolates numbered placeholders", () => {
    expect(t("zh", "perm.rejectIn", { n: 12 })).toBe("将在 12s 后拒绝");
    expect(t("en", "perm.rejectIn", { n: 12 })).toBe("Declining in 12s");
    expect(t("en", "account.weekly", { n: 50 })).toBe("Weekly 50%");
  });

  it("keeps locale switcher labels in their native scripts", () => {
    expect(LOCALE_CHOICES.map((c) => [c.id, c.native])).toEqual([
      ["zh", "简体中文"],
      ["en", "English"],
    ]);
  });

  it("indexes settings search across both languages", () => {
    const hay = localeSearchHay("settings.locale");
    expect(hay).toContain("界面语言");
    expect(hay).toContain("Language");
  });

  it("covers rail account extra toast stats chrome", () => {
    expect(t("zh", "rail.explorer")).toBe("文件管理");
    expect(t("en", "rail.explorer")).toBe("Files");
    expect(t("zh", "rail.review")).toBe("Dashboard");
    expect(t("en", "rail.review")).toBe("Dashboard");
    expect(t("zh", "sidebar.pin")).toBe("置顶");
    expect(t("en", "sidebar.pin")).toBe("Pinned");
    expect(t("zh", "extra.dashboard")).toBe("会话总览");
    expect(t("en", "extra.dashboard")).toBe("Sessions");
    expect(t("zh", "pane.splitRight")).toBe("向右拆开");
    expect(t("en", "pane.reveal")).toBe("Reveal");
    expect(t("zh", "pane.tooSmall")).toBe("这里放不下");
    expect(t("zh", "git.checkout")).toBe("切换分支");
    expect(t("zh", "git.newWorktree")).toBe("新建 worktree");
    expect(t("en", "toast.undo")).toBe("Undo");
    expect(t("zh", "stats.footer", { ttft: "300ms", rate: "50 tok/s", tok: "12.4k" })).toBe(
      "首字 300ms · 速率 50 tok/s · 已用 12.4k",
    );
    expect(t("en", "stats.footer", { ttft: "300ms", rate: "50 tok/s", tok: "12.4k" })).toBe(
      "TTFT 300ms · Rate 50 tok/s · Used 12.4k",
    );
  });
});

describe("fallbackCopy", () => {
  it("returns error-boundary title and retry for each locale", () => {
    expect(fallbackCopy("zh")).toEqual({ title: "出了点问题", retry: "重试" });
    expect(fallbackCopy("en")).toEqual({ title: "Something went wrong", retry: "Retry" });
  });
});

describe("isDangerousTrustPath", () => {
  const home = "/Users/me";

  it("flags /, $HOME, Desktop, and Downloads", () => {
    expect(isDangerousTrustPath("/", home)).toBe(true);
    expect(isDangerousTrustPath(home, home)).toBe(true);
    expect(isDangerousTrustPath(`${home}/Desktop`, home)).toBe(true);
    expect(isDangerousTrustPath(`${home}/Downloads`, home)).toBe(true);
  });

  it("allows a normal project folder", () => {
    expect(isDangerousTrustPath(`${home}/project`, home)).toBe(false);
    expect(isDangerousTrustPath("/tmp/work", home)).toBe(false);
  });
});
