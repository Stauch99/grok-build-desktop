import { tr } from "./i18n-bridge";

export function marketplaceJsonHelp(): string {
  return tr("hub.marketplaceHelp");
}

export function serveStatusLines(): string[] {
  return ["grok agent serve"];
}

export function isExternalHttp(href: string): boolean {
  return /^https?:\/\//i.test(href.trim());
}
