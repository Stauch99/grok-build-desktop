export function marketplaceJsonHelp(): string {
  return "自建市场放 marketplace.json，再用 grok plugin marketplace add 加源。桌面不另开商店。";
}

export function serveStatusLines(): string[] {
  return ["grok agent serve"];
}

export function isExternalHttp(href: string): boolean {
  return /^https?:\/\//i.test(href.trim());
}
