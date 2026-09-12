// Grok Build · Redesign v2 prototype — interactions only, mock data.

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const root = document.documentElement;

/* ---------- theme ---------- */
$("#theme-toggle").addEventListener("click", () => {
  const dark = root.dataset.theme === "dark";
  root.dataset.theme = dark ? "" : "dark";
  if (dark) root.removeAttribute("data-theme");
  $("#ico-moon").style.display = dark ? "" : "none";
  $("#ico-sun").style.display = dark ? "none" : "";
});

/* ---------- palette & settings overlays ---------- */
const palette = $("#palette-scrim");
const settings = $("#settings-scrim");

const openPalette = () => {
  palette.hidden = false;
  $(".palette-input input").focus();
};
const closeOverlays = () => {
  palette.hidden = true;
  settings.hidden = true;
  $$(".menu").forEach((m) => (m.hidden = true));
};

$("#open-palette").addEventListener("click", openPalette);
$("#open-settings").addEventListener("click", () => {
  settings.hidden = false;
});
$$("[data-close]").forEach((b) =>
  b.addEventListener("click", () => ($("#" + b.dataset.close).hidden = true)),
);
[palette, settings].forEach((scrim) =>
  scrim.addEventListener("click", (e) => {
    if (e.target === scrim) closeOverlays();
  }),
);

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openPalette();
  }
  if (e.key === "Escape") closeOverlays();
});

/* ---------- sidebar ---------- */
$$("[data-project] .project-head").forEach((head) =>
  head.addEventListener("click", () => head.parentElement.classList.toggle("closed")),
);
$$("[data-session]").forEach((s) =>
  s.addEventListener("click", () => {
    $$("[data-session]").forEach((x) => x.classList.remove("active"));
    s.classList.add("active");
  }),
);

/* ---------- rail ---------- */
$("#rail-toggle").addEventListener("click", (e) => {
  $("#app").classList.toggle("rail-open");
  e.currentTarget.classList.toggle("on");
});
$$("#rail-seg button").forEach((btn) =>
  btn.addEventListener("click", () => {
    $$("#rail-seg button").forEach((b) => b.classList.remove("on"));
    btn.classList.add("on");
    $$(".rail-pane").forEach((p) =>
      p.classList.toggle("on", p.dataset.pane === btn.dataset.pane),
    );
  }),
);

/* ---------- run timeline ---------- */
$$("[data-run] .run-head").forEach((head) =>
  head.addEventListener("click", () => head.closest(".run").classList.toggle("closed")),
);
$$("[data-tool]").forEach((tool) =>
  tool.addEventListener("click", () => {
    const item = tool.closest(".run-item");
    if ($(".tool-detail", item)) item.classList.toggle("open");
  }),
);

/* ---------- chip menus ---------- */
let openMenu = null;
$$("[data-menu]").forEach((chip) =>
  chip.addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = $("#" + chip.dataset.menu);
    const wasOpen = !menu.hidden;
    $$(".menu").forEach((m) => (m.hidden = true));
    if (wasOpen) return;
    const r = chip.getBoundingClientRect();
    menu.hidden = false;
    menu.style.bottom = window.innerHeight - r.top + 6 + "px";
    menu.style.left = r.left + "px";
    openMenu = menu;
  }),
);
document.addEventListener("click", (e) => {
  if (openMenu && !openMenu.contains(e.target)) openMenu.hidden = true;
});

/* ---------- toast ---------- */
let toastTimer;
const toast = (msg) => {
  const el = $("#toast");
  $("#toast-text").textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
};
$$("[data-toast]").forEach((b) =>
  b.addEventListener("click", () => toast(b.dataset.toast)),
);
$("#toast-act").addEventListener("click", () => ($("#toast").hidden = true));

/* ---------- send / stop toggle ---------- */
$("#send-btn").addEventListener("click", (e) => {
  const btn = e.currentTarget;
  btn.classList.toggle("stop");
  toast(btn.classList.contains("stop") ? "已停止本轮运行" : "已发送");
});

/* ---------- settings toggles ---------- */
$$("[data-toggle]").forEach((t) =>
  t.addEventListener("click", () => t.classList.toggle("on")),
);
