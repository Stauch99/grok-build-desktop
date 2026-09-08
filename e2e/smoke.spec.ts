import { test, expect, type Page } from "@playwright/test";

async function installTauriStub(page: Page) {
  await page.addInitScript(() => {
    const callbacks = new Map<number, (...args: unknown[]) => void>();
    let nextId = 1;

    const invoke = async (cmd: string) => {
      if (cmd === "doctor") {
        return { grokHome: "/tmp/grok", authPresent: false, grokPath: null, grokVersion: null };
      }
      if (cmd === "doctor_all") return [];
      if (cmd === "load_webui_state") return {};
      if (cmd === "read_cli_settings") return null;
      if (cmd === "list_sessions") return [];
      if (cmd === "ensure_inbox") return "/tmp/inbox";
      if (cmd === "list_workspace_entries") return [];
      if (cmd === "list_memory_changes") return [];
      if (cmd === "list_project_roots") return [];
      if (cmd === "git_status") return { isRepo: false, branch: "", ahead: 0, behind: 0, dirty: 0, remote: "", hasUpstream: false };
      if (cmd === "git_changes") return [];
      if (cmd === "inspect_brief") return { skills: [], mcp: [], plugins: [], hooks: [] };
      if (cmd === "read_plan") return null;
      if (cmd === "list_project_rules") return [];
      if (cmd === "path_is_dir") return false;
      if (cmd === "next_rpc_id") return 1;
      if (cmd === "plugin:event|listen") return 1;
      if (cmd === "plugin:event|unlisten") return null;
      if (cmd.startsWith("plugin:window|")) {
        if (cmd.includes("is_focused") || cmd.endsWith("isFocused")) return true;
        return null;
      }
      if (cmd.startsWith("plugin:webview|") || cmd.startsWith("plugin:notification|")) return null;
      return null;
    };

    const w = window as Window & {
      __TAURI_INTERNALS__?: Record<string, unknown>;
      __TAURI_EVENT_PLUGIN_INTERNALS__?: Record<string, unknown>;
    };

    w.__TAURI_INTERNALS__ = {
      invoke,
      transformCallback(callback: (...args: unknown[]) => void) {
        const id = nextId++;
        callbacks.set(id, callback);
        return id;
      },
      unregisterCallback(id: number) {
        callbacks.delete(id);
      },
      convertFileSrc: (path: string) => path,
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main" },
      },
    };

    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener() {},
    };
  });
}

test.describe("desktop chrome smoke", () => {
  test("renders the shell and captures a screenshot", async ({ page }) => {
    await installTauriStub(page);
    await page.goto("/");
    await expect(page.locator("#root")).toBeVisible();
    await expect(page.locator(".composer textarea")).toBeVisible();
    await page.waitForTimeout(800);
    const aligned = await page.evaluate(() => {
      const ta = document.querySelector(".composer textarea");
      const send = document.querySelector(".send-btn");
      if (!(ta instanceof HTMLElement) || !(send instanceof HTMLElement)) return null;
      const a = ta.getBoundingClientRect();
      const b = send.getBoundingClientRect();
      return Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2);
    });
    expect(aligned).not.toBeNull();
    expect(aligned!).toBeLessThan(2);
    const root = page.locator("#root");
    await expect(root).not.toHaveText(/^\s*$/);
    const shot = await page.screenshot({ fullPage: true });
    await test.info().attach("chrome", { body: shot, contentType: "image/png" });
    expect(shot.byteLength).toBeGreaterThan(2_000);
    if (process.env.CI) {
      await expect(page).toHaveScreenshot("chrome.png", { fullPage: true });
    }
  });

  test("review close tooltip opens below the header instead of clipping at the window edge", async ({ page }) => {
    await installTauriStub(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Dashboard" }).first().click();
    const close = page.locator(".review-head > .icon-btn[data-tip]");
    await expect(close).toBeVisible();
    await close.hover();
    const pos = await close.evaluate((el) => {
      const tip = getComputedStyle(el, "::after");
      const rect = el.getBoundingClientRect();
      return {
        content: tip.content,
        top: tip.top,
        bottom: tip.bottom,
        right: tip.right,
        left: tip.left,
        btnHeight: rect.height,
        btnTop: rect.top,
      };
    });
    expect(pos.content).toContain("关闭右侧栏");
    expect(parseFloat(pos.top)).toBeGreaterThan(pos.btnHeight);
    expect(parseFloat(pos.bottom)).toBeLessThan(0);
    const shot = await page.screenshot();
    await test.info().attach("review-close-tip", { body: shot, contentType: "image/png" });
  });

  test("thread markdown uses system UI body and Noto Serif headings", async ({ page }) => {
    await installTauriStub(page);
    await page.goto("/");
    await expect(page.locator("#root")).toBeVisible();
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      const thread = document.createElement("div");
      thread.className = "thread";
      thread.innerHTML = `<div class="md"><h2>标题 Heading</h2><p>正文 paragraph with enough words to wrap.</p></div>`;
      document.body.appendChild(thread);
      const heading = getComputedStyle(thread.querySelector("h2")!);
      const body = getComputedStyle(thread.querySelector("p")!);
      return {
        headingFamily: heading.fontFamily,
        headingWeight: heading.fontWeight,
        headingLead: parseFloat(heading.lineHeight) / parseFloat(heading.fontSize),
        bodyFamily: body.fontFamily,
        bodyLead: parseFloat(body.lineHeight) / parseFloat(body.fontSize),
        notoReady: document.fonts.check('600 18px "Noto Serif SC"') || document.fonts.check('600 18px "Noto Serif"'),
      };
    });
    expect(fonts.bodyFamily).toMatch(/system-ui|PingFang|Segoe UI|Hiragino|Apple System/i);
    expect(fonts.bodyFamily).not.toMatch(/HarmonyOS/i);
    expect(fonts.headingFamily).toMatch(/Noto Serif/);
    expect(fonts.bodyLead).toBeCloseTo(1.65, 2);
    expect(fonts.headingLead).toBeCloseTo(1.485, 2);
    expect(fonts.notoReady).toBe(true);
  });

  test("preview markdown matches thread markdown type", async ({ page }) => {
    await installTauriStub(page);
    await page.goto("/");
    await expect(page.locator(".app")).toBeVisible();
    const sizes = await page.evaluate(async () => {
      await document.fonts.ready;
      const app = document.querySelector(".app");
      if (!app) throw new Error("missing .app");
      const sample = `<div class="md"><h2>标题 Heading</h2><p>正文 paragraph with enough words to wrap.</p></div>`;
      const thread = document.createElement("div");
      thread.className = "thread";
      thread.innerHTML = sample;
      const preview = document.createElement("div");
      preview.className = "preview-body md-scroll";
      preview.innerHTML = sample;
      app.appendChild(thread);
      app.appendChild(preview);
      const pick = (root) => {
        const h2 = getComputedStyle(root.querySelector("h2")!);
        const p = getComputedStyle(root.querySelector("p")!);
        return {
          pSize: p.fontSize,
          pLead: p.lineHeight,
          pFamily: p.fontFamily,
          hSize: h2.fontSize,
          hLead: h2.lineHeight,
          hFamily: h2.fontFamily,
        };
      };
      const out = { thread: pick(thread), preview: pick(preview) };
      thread.remove();
      preview.remove();
      return out;
    });
    expect(sizes.preview).toEqual(sizes.thread);
  });

  test("composer, recap, and wait chrome follow the chat body size", async ({ page }) => {
    await installTauriStub(page);
    await page.goto("/");
    await expect(page.locator(".app")).toBeVisible();
    const sizes = await page.evaluate(() => {
      const app = document.querySelector(".app");
      if (!app) throw new Error("missing .app");
      const probe = document.createElement("div");
      probe.innerHTML = `
        <div class="thread"><div class="md"><p>正文</p></div>
          <div class="work-cluster work-run live"><span class="work-run-text">思考中</span></div>
        </div>
        <div class="composer"><textarea></textarea></div>
        <div class="composer-meta-row"><button type="button" class="cwd-chip">proj</button></div>
        <div class="dock-capsule"><span>目标 recap</span></div>
        <div class="wait-pill"><span class="wait-label">思考中</span></div>
      `;
      app.appendChild(probe);
      const px = (sel: string) => getComputedStyle(probe.querySelector(sel)!).fontSize;
      const out = {
        md: px(".md p"),
        ta: px("textarea"),
        recap: px(".work-run-text"),
        dock: px(".dock-capsule"),
        wait: px(".wait-pill"),
        chip: px(".cwd-chip"),
      };
      probe.remove();
      return out;
    });
    expect(sizes.md).toMatch(/^\d+(\.\d+)?px$/);
    expect(sizes.ta).toBe(sizes.md);
    expect(sizes.recap).toBe(sizes.md);
    expect(sizes.dock).toBe(sizes.md);
    expect(sizes.wait).toBe(sizes.md);
    expect(parseFloat(sizes.chip)).toBeCloseTo(parseFloat(sizes.md) - 2, 5);
  });

  test("accent swatch tints the brand surfaces without painting the send button", async ({ page }) => {
    await installTauriStub(page);
    await page.goto("/");
    await expect(page.locator(".app")).toBeVisible();
    await page.getByRole("button", { name: "未登录" }).click();
    await page.getByRole("menuitem", { name: "设置" }).click();
    await page.getByRole("button", { name: "外观" }).click();
    await page.getByRole("radio", { name: "粉" }).click();
    await expect(page.getByRole("radio", { name: "粉" })).toHaveAttribute("aria-checked", "true");

    const brand = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--brand").trim());
    expect(brand.toUpperCase()).toBe("#F0549C");

    const surfaces = await page.evaluate(() => {
      const app = document.querySelector(".app");
      if (!app) throw new Error("missing .app");
      const probe = document.createElement("div");
      probe.innerHTML = `
        <div class="msg user"><div class="md"><p>你好</p></div></div>
        <aside class="sidebar"></aside>
        <div class="composer"><textarea></textarea><button class="send-btn" type="button">发送</button></div>
      `;
      app.appendChild(probe);
      probe.querySelector("textarea")!.focus();
      const out = {
        bubble: getComputedStyle(probe.querySelector(".msg.user .md")!).backgroundColor,
        sidebar: getComputedStyle(probe.querySelector(".sidebar")!).borderRightColor,
        composer: getComputedStyle(probe.querySelector(".composer")!).borderColor,
        send: getComputedStyle(probe.querySelector(".send-btn")!).backgroundColor,
      };
      probe.remove();
      return out;
    });
    expect(surfaces.bubble).toMatch(/color\(srgb|rgba?\(/);
    expect(surfaces.bubble).not.toBe("rgba(0, 0, 0, 0)");
    expect(surfaces.sidebar).toMatch(/color\(srgb|rgba?\(/);
    expect(surfaces.composer).toMatch(/color\(srgb|rgba?\(/);
    expect(surfaces.send).not.toBe(surfaces.bubble);

    await page.getByRole("button", { name: "关于" }).click();
    await expect(page.locator(".about-logo")).toBeVisible();
  });
});
