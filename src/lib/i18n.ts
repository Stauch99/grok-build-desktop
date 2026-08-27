export type Locale = "zh" | "en";

const ZH: Record<string, string> = {
  "settings.title": "设置",
  "settings.overview": "总览",
  "settings.appearance": "外观",
  "settings.chat": "对话",
  "settings.extensions": "扩展中心",
  "settings.about": "关于",
  "settings.inbox": "独立对话",
  "hub.title": "扩展中心",
  "hub.skills": "技能",
  "hub.mcp": "MCP",
  "hub.plugins": "插件",
  "hub.marketplace": "市场",
  "hub.hooks": "Hooks",
  "hub.empty.skills": "还没有技能。用右上角新建，或运行 /create-skill。",
  "hub.empty.mcp": "还没有 MCP。用添加向导或一键常用服务器。",
  "hub.empty.plugins": "还没有已装插件。到市场安装。",
  "hub.empty.market": "没有市场源，或刷新失败。先添加 git / GitHub / 本地源。",
  "hub.empty.search": "没有匹配的结果。",
  "hub.manageSkills": "管理技能",
  "hub.add": "添加",
  "hub.enable": "启用",
  "hub.disable": "禁用",
  "hub.delete": "删除",
  "hub.trust": "信任并安装",
  "hub.confirmAgain": "再点一次确认",
  "health.cli": "CLI",
  "health.login": "登录",
  "health.inspect": "inspect",
  "health.doctor": "MCP doctor",
  "trust.banner": "此项目尚未信任。项目级 Hooks / MCP / LSP 会被跳过。",
  "trust.action": "信任此文件夹",
  "compat.claude": "兼容 Claude 扫描",
  "compat.cursor": "兼容 Cursor 扫描",
};

const EN: Record<string, string> = {
  "settings.title": "Settings",
  "settings.overview": "Overview",
  "settings.appearance": "Appearance",
  "settings.chat": "Chat",
  "settings.extensions": "Extensions",
  "settings.about": "About",
  "settings.inbox": "Inbox chats",
  "hub.title": "Extensions",
  "hub.skills": "Skills",
  "hub.mcp": "MCP",
  "hub.plugins": "Plugins",
  "hub.marketplace": "Marketplace",
  "hub.hooks": "Hooks",
  "hub.empty.skills": "No skills yet. Create one, or send /create-skill.",
  "hub.empty.mcp": "No MCP servers. Use the add wizard or a popular preset.",
  "hub.empty.plugins": "No plugins installed. Browse the marketplace.",
  "hub.empty.market": "No marketplace sources, or refresh failed. Add a git / GitHub / local source.",
  "hub.empty.search": "No matches.",
  "hub.manageSkills": "Manage skills",
  "hub.add": "Add",
  "hub.enable": "Enable",
  "hub.disable": "Disable",
  "hub.delete": "Delete",
  "hub.trust": "Trust and install",
  "hub.confirmAgain": "Click again to confirm",
  "health.cli": "CLI",
  "health.login": "Sign-in",
  "health.inspect": "inspect",
  "health.doctor": "MCP doctor",
  "trust.banner": "This folder is not trusted. Project hooks / MCP / LSP stay skipped.",
  "trust.action": "Trust this folder",
  "compat.claude": "Scan Claude compat",
  "compat.cursor": "Scan Cursor compat",
};

const TABLES: Record<Locale, Record<string, string>> = { zh: ZH, en: EN };

export function t(locale: Locale, key: string): string {
  return TABLES[locale][key] ?? TABLES.zh[key] ?? key;
}

export function normalizeLocale(raw: unknown): Locale {
  return raw === "en" ? "en" : "zh";
}
