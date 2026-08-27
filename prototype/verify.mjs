import { chromium } from "/Users/foxie/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { mkdir } from "node:fs/promises";

const out = new URL("./shots/", import.meta.url);
await mkdir(out, { recursive: true });
const shot = (name) => new URL(name, out).pathname;

const browser = await chromium.launch({
  executablePath:
    "/Users/foxie/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  headless: true,
});

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
};

const page = await browser.newPage({ viewport: { width: 1280, height: 840 } });
await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
await page.waitForSelector(".app");

const noX = async () =>
  page.evaluate(() => {
    const nodes = [document.documentElement, document.body, document.querySelector(".app"), document.querySelector(".chat"), document.querySelector(".settings")].filter(Boolean);
    return nodes.every((n) => n.scrollWidth <= n.clientWidth + 1);
  });

check("wide: three-column grid", await page.locator(".app").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length === 3));
check("wide: no overflow-x", await noX());
check("wide: url chip is clean", (await page.locator(".url-chip").allTextContents()).every((t) => /^https?:\/\/[^"<>]+$/.test(t)));
check("assistant fills thread", await page.locator(".msg.assistant").evaluate((el) => Math.abs(el.getBoundingClientRect().width - el.parentElement.getBoundingClientRect().width) < 2));
check("user bubble not full width", await page.locator(".msg.user").evaluate((el) => el.getBoundingClientRect().width < el.parentElement.getBoundingClientRect().width - 40));
check("sun toggle present", (await page.locator('.icon-btn[aria-label="切换浅色/深色"]').count()) === 1);
check("settings gear in footer", (await page.locator('.icon-btn[aria-label="设置"]').count()) === 1);
check("no session/settings tabs", (await page.locator(".tabs").count()) === 0);
check("no connectors", !(await page.locator(".rail").innerText()).includes("连接器"));
check("mode chip is in composer", (await page.locator(".composer .mode-chip").count()) === 1);
check("rail has no mode segments", (await page.locator(".rail .seg").count()) === 0 && !(await page.locator(".rail").innerText()).includes("始终批准"));
check("mode chip sits left of model", await page.evaluate(() => {
  const mode = document.querySelector(".composer .mode-chip")?.getBoundingClientRect();
  const model = document.querySelector(".composer .model-chip")?.getBoundingClientRect();
  return !!(mode && model && mode.right <= model.left + 1 && Math.abs(mode.top - model.top) < 8);
}));
check("plan hides 3-check placeholder", (await page.locator(".rail .steps").count()) === 0 && (await page.locator(".rail .todo li").count()) >= 1);
check("folders vs files modules", (await page.locator(".dir-mod h4").allTextContents()).join(",") === "文件夹,文件,本轮文件");
check("no chart placeholder", (await page.locator(".folder-preview").count()) === 0);
await page.screenshot({ path: shot("wide.png"), fullPage: false });

await page.locator('.icon-btn[aria-label="切换浅色/深色"]').click();
check("theme toggles dark", await page.evaluate(() => document.documentElement.dataset.theme === "dark"));
await page.screenshot({ path: shot("dark.png") });
await page.locator('.icon-btn[aria-label="切换浅色/深色"]').click();

await page.locator(".search").fill("原型");
check("search by override title", (await page.locator(".session .title").allTextContents()).some((t) => t.includes("桌面端交互原型")));
await page.locator(".search").fill("");

await page.locator(".session-title-btn").click();
check("inline title edit", await page.locator(".title-input").count() === 1);
await page.locator(".title-input").fill("手改标题");
await page.locator(".title-input").press("Enter");
check("title commit", (await page.locator(".session-title-btn").innerText()) === "手改标题");

await page.locator('[data-act="header-menu"]').click();
check("session menu opens", await page.locator(".menu").count() === 1);
await page.keyboard.press("Escape");
check("escape closes menu", await page.locator(".menu").count() === 0);

await page.setViewportSize({ width: 720, height: 700 });
await page.waitForTimeout(80);
check("narrow: two columns", await page.locator(".app").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length === 2));
check("narrow: rail closed by default", (await page.locator(".rail").count()) === 0);
check("narrow: no overflow-x", await noX());
check("narrow: sidebar still clickable", await page.locator(".new-task").first().isEnabled());
await page.screenshot({ path: shot("narrow.png") });

await page.locator('[data-act="toggle-rail"]').click();
check("narrow: overlay rail opens", await page.locator(".app.rail-overlay .rail").count() === 1);
check("backdrop is workspace child", await page.locator(".workspace > .rail-backdrop").count() === 1);
const sidebarBox = await page.locator(".sidebar").boundingBox();
const backdropBox = await page.locator(".rail-backdrop").boundingBox();
check(
  "backdrop does not cover sidebar",
  sidebarBox && backdropBox && backdropBox.x >= sidebarBox.x + sidebarBox.width - 1,
  `sidebar.right=${sidebarBox.x + sidebarBox.width} backdrop.x=${backdropBox.x}`,
);
await page.locator(".session-list .title").first().click();
check("sidebar click works under overlay", await page.locator(".session.active").count() === 1);
await page.screenshot({ path: shot("overlay.png") });
await page.keyboard.press("Escape");
check("escape closes overlay", (await page.locator(".rail").count()) === 0);

await page.setViewportSize({ width: 1280, height: 840 });
await page.waitForTimeout(80);
if ((await page.locator(".rail").count()) === 0) {
  await page.locator('[data-act="toggle-rail"]').click();
}
check("wide after toggle: rail column returns", (await page.locator(".rail").count()) === 1 && !(await page.locator(".app").evaluate((el) => el.classList.contains("rail-overlay"))));
await page.locator('[data-act="new-session"]').click();
check("new session empty progress placeholder", (await page.locator(".rail .steps").count()) === 1 && (await page.locator(".rail .todo").count()) === 0);

await page.locator("textarea").fill("补一下工作目录模块");
await page.locator('[data-act="send"]').click();
await page.waitForSelector(".spark", { state: "detached", timeout: 3000 });
check("send produces assistant + plan", (await page.locator(".msg.assistant").count()) >= 1 && (await page.locator(".rail .todo li").count()) >= 1);

await page.locator('[data-act="mode-open"]').click();
check("mode menu opens upward", await page.locator(".mode-menu").count() === 1);
await page.locator('[data-act="pick-mode"][data-mode="plan"]').click();
check("mode control toasts live slash", (await page.locator(".toast").innerText()).includes("/plan"));
check("chip label is Plan", (await page.locator(".composer .mode-chip").innerText()).includes("Plan"));
await page.locator("textarea").press("Shift+Tab");
check("Shift+Tab cycles to 始终批准", (await page.locator(".composer .mode-chip").innerText()).includes("始终批准"));
check("yolo chip has warning class", await page.locator(".composer .mode-chip.yolo").count() === 1);

await page.locator('[data-act="open-settings"]').click();
check("settings is a dialog", await page.locator(".settings-dialog").count() === 1);
check("chat stays under settings", await page.locator(".chat").count() === 1);
check("settings dialog no overflow-x", await page.locator(".settings-dialog").evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
await page.screenshot({ path: shot("settings.png") });
await page.keyboard.press("Escape");
check("escape closes settings", (await page.locator(".settings-dialog").count()) === 0);
await page.locator('[data-act="open-settings"]').click();
await page.locator(".settings-backdrop").click({ position: { x: 8, y: 8 } });
check("backdrop closes settings", (await page.locator(".settings-dialog").count()) === 0);
await page.setViewportSize({ width: 720, height: 700 });
await page.locator('[data-act="open-settings"]').click();
check("settings dialog fits 720", await page.locator(".settings-dialog").evaluate((el) => el.getBoundingClientRect().width <= 720 && el.scrollWidth <= el.clientWidth + 1));
await page.screenshot({ path: shot("settings-720.png") });

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
