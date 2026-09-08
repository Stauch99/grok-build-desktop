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
      if (cmd === "list_sessions") return [{ id: "s1", agentId: "grok", cwd: "/tmp", title: "hi", updatedAt: Date.now() }];
      if (cmd === "ensure_inbox") return "/tmp/inbox";
      if (cmd === "list_workspace_entries") return [];
      if (cmd === "list_memory_changes") return [];
      if (cmd === "list_project_roots") return [];
      if (cmd === "git_status") {
        return { isRepo: false, branch: "", ahead: 0, behind: 0, dirty: 0, remote: "", hasUpstream: false };
      }
      if (cmd === "git_changes") return [];
      if (cmd === "inspect_brief") return { skills: [], mcp: [], plugins: [], hooks: [] };
      if (cmd === "read_plan") return null;
      if (cmd === "list_project_rules") return [];
      if (cmd === "path_is_dir") return false;
      if (cmd === "next_rpc_id") return 1;
      if (cmd === "memory_activity") {
        return {
          days: [{ day: "2026-09-08", dailyLines: 4, mcpAppends: 1, newSessions: 1, promoted: 2, memBytes: 1024 }],
          earliestDay: "2026-09-01",
        };
      }
      if (cmd === "read_memory_events") {
        return [
          { at: Date.parse("2026-09-08T04:00:00Z"), kind: "dream_sweep", prompts: 1, inChars: 8200, count: 3 },
          { at: Date.parse("2026-09-08T04:00:01Z"), kind: "promote", count: 2 },
        ];
      }
      if (cmd === "read_memory_host") {
        return {
          userMd: "# You\n",
          dreamsMd: "## 2026-09-08\n整理了一天的偏好。\n",
          dailyMd: "",
          stateJson: JSON.stringify({ tagline: "专为测试打造的工作台" }),
          memoryRoot: "/tmp/memory",
        };
      }
      if (cmd === "read_session_updates") return { rows: [], nextByte: 0, truncated: false };
      if (cmd === "write_memory_host" || cmd === "append_memory_event") return null;
      if (cmd === "install_memory_mcp" || cmd === "memory_mcp_status") {
        return { path: "/tmp/memory-mcp", executable: true, registered: true };
      }
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
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  });
}

test.describe("memory growth page", () => {
  test("renders header, metric switch, heatmap, and timeline", async ({ page }) => {
    await installTauriStub(page);
    await page.goto("/");
    await expect(page.locator(".composer textarea")).toBeVisible();
    await page.locator(".composer textarea").fill("/memory");
    await page.getByRole("option", { name: /记忆|Memory/ }).click();
    const dialog = page.getByRole("dialog", { name: /记忆|Memory/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: /工作台|workbench/ })).toBeVisible();
    await expect(dialog.locator(".growth-tagline")).toBeVisible();
    await expect(dialog.getByRole("radio", { name: "亲密度" })).toHaveAttribute("aria-checked", "true");
    await dialog.getByRole("radio", { name: "成长度" }).click();
    await expect(dialog.getByRole("radio", { name: "成长度" })).toHaveAttribute("aria-checked", "true");
    await expect(dialog.locator(".growth-heat-cell")).toHaveCount(53 * 7);
    const gridBox = await dialog.locator(".growth-heat-grid").boundingBox();
    const dialogBox = await dialog.boundingBox();
    expect(gridBox && dialogBox).toBeTruthy();
    expect(gridBox!.width).toBeGreaterThan(dialogBox!.width * 0.9);
    const heatOverflow = await dialog.locator(".growth-heat").evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(heatOverflow.scrollWidth).toBeLessThanOrEqual(heatOverflow.clientWidth + 1);
    const bodyOverflow = await dialog.locator(".settings-body").evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(bodyOverflow.scrollWidth).toBeLessThanOrEqual(bodyOverflow.clientWidth + 1);
    await dialog.getByRole("button", { name: /更多|More/ }).click();
    const menu = dialog.locator(".growth-menu-wrap .menu");
    await expect(menu.getByRole("menuitem").first()).toBeVisible();
    const btn = await dialog.getByRole("button", { name: /更多|More/ }).boundingBox();
    const menuBox = await menu.boundingBox();
    expect(btn && menuBox).toBeTruthy();
    expect(menuBox!.y).toBeGreaterThan(btn!.y);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(btn!.x + btn!.width + 8);
    await dialog.locator(".growth-timeline-day").first().click();
    await expect(dialog.locator(".growth-paper")).toBeVisible();
  });

  test("opens from settings without typing a slash command", async ({ page }) => {
    await installTauriStub(page);
    await page.goto("/");
    await page.locator(".account-trigger").click();
    await page.getByRole("menuitem", { name: /设置|Settings/ }).click();
    const settings = page.locator(".settings-dialog");
    await expect(settings).toBeVisible();
    await settings.locator(".settings-nav").getByRole("button", { name: /记忆|Memory/ }).click();
    await settings.getByRole("button", { name: /打开成长记忆|Open growth memory/ }).click();
    await expect(page.getByRole("dialog", { name: /记忆|Memory/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /工作台|workbench/ })).toBeVisible();
  });
});
