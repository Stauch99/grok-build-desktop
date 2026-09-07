import { expect, test, type Page } from "@playwright/test";

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

test("selecting assistant text opens the toolbar and rewrite prefills the composer", async ({ page }) => {
  await installTauriStub(page);
  await page.goto("/");
  const host = page.locator(".chat-shell").first();
  await expect(host).toBeVisible();
  const thread = host.locator(".thread").first();
  await expect(thread).toBeVisible();
  await thread.evaluate((el) => {
    const msg = document.createElement("div");
    msg.className = "msg assistant";
    msg.textContent = "The quick brown fox jumps over the lazy dog.";
    el.appendChild(msg);
  });

  await thread.locator(".msg.assistant").evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = document.getSelection();
    sel!.removeAllRanges();
    sel!.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });

  const toolbar = page.locator('.sel-toolbar[role="toolbar"]');
  await expect(toolbar).toBeVisible();

  const rewrite = toolbar.getByRole("button", { name: "改写" });
  if (await rewrite.count()) {
    await rewrite.click();
  } else {
    await toolbar.getByRole("button").first().click();
  }
  const composer = page.locator(".composer textarea").first();
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue(/The quick brown fox/);
  await expect(composer).toHaveValue(/改写上面这段/);
});
