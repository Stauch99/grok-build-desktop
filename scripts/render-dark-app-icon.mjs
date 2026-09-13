#!/usr/bin/env node
/**
 * Rasterize src-tauri/icons/logo-source-dark.svg -> logo-source-dark.png (1024)
 * and refresh AppIcon.icon/Assets/{light,dark}.png for macOS night-mode Dock icon.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const icons = path.join(root, "src-tauri", "icons");
const svgPath = path.join(icons, "logo-source-dark.svg");
const darkPng = path.join(icons, "logo-source-dark.png");
const lightSrc = path.join(icons, "logo-source.png");
const pack = path.join(icons, "AppIcon.icon", "Assets");

const svg = fs.readFileSync(svgPath, "utf8");
const html = `<!doctype html><html><head><style>
html,body{margin:0;padding:0;background:transparent;width:1024px;height:1024px;overflow:hidden}
svg{display:block;width:1024px;height:1024px}
</style></head><body>${svg}</body></html>`;
const htmlPath = path.join("/tmp", "grok-dark-icon-render.html");
fs.writeFileSync(htmlPath, html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
await page.goto("file://" + htmlPath);
await page.waitForTimeout(200);
await page.screenshot({ path: darkPng, omitBackground: true });
await browser.close();

fs.mkdirSync(pack, { recursive: true });
fs.copyFileSync(lightSrc, path.join(pack, "light.png"));
fs.copyFileSync(darkPng, path.join(pack, "dark.png"));
console.log("updated", darkPng);
console.log("updated", path.join(pack, "light.png"), "and dark.png");
