export type PermissionRuleSet = { allow: string[]; deny: string[] };

function readQuoted(text: string, start: number): { value: string; end: number } {
  const quote = text[start];
  if (quote !== '"' && quote !== "'") return { value: "", end: start + 1 };
  let i = start + 1;
  let value = "";
  while (i < text.length) {
    const c = text[i]!;
    if (c === "\\" && i + 1 < text.length) {
      value += text[i + 1];
      i += 2;
      continue;
    }
    if (c === quote) return { value, end: i + 1 };
    value += c;
    i++;
  }
  return { value, end: i };
}

function readStringArray(text: string, start: number): { values: string[]; end: number } {
  const values: string[] = [];
  let i = start;
  while (i < text.length) {
    const c = text[i]!;
    if (c === "]") return { values, end: i + 1 };
    if (c === '"' || c === "'") {
      const read = readQuoted(text, i);
      const item = read.value.trim();
      if (item) values.push(item);
      i = read.end;
      continue;
    }
    i++;
  }
  return { values, end: i };
}

function keyedArrayPattern(key: "allow" | "deny", assign: "=" | ":"): RegExp {
  const left = assign === "=" ? `(?:[\\w.]+\\.)?${key}\\s*=` : `"${key}"\\s*:`;
  return new RegExp(`(?:^|[\\n;{,])\\s*${left}\\s*\\[`, "gi");
}

function extractKeyedArrays(text: string, key: "allow" | "deny"): string[] {
  const out: string[] = [];
  for (const assign of ["=", ":"] as const) {
    const re = keyedArrayPattern(key, assign);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const start = m.index + m[0].length;
      const read = readStringArray(text, start);
      out.push(...read.values);
      re.lastIndex = Math.max(read.end, m.index + 1);
    }
  }
  return out;
}

function extractKeyedStrings(text: string, key: "allow" | "deny"): string[] {
  const out: string[] = [];
  const re = new RegExp(
    `(?:^|[\\n;{,])\\s*(?:[\\w.]+\\.)?${key}\\s*=\\s*(["'])`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const quoteAt = m.index + m[0].length - 1;
    const read = readQuoted(text, quoteAt);
    const item = read.value.trim();
    if (item) out.push(item);
    re.lastIndex = Math.max(read.end, m.index + 1);
  }
  return out;
}

function formatStructured(tool: string, pattern?: string): string {
  const t = tool.trim();
  const p = pattern?.trim();
  if (p) return `${t}(${p})`;
  return t;
}

function extractStructured(text: string): PermissionRuleSet {
  const allow: string[] = [];
  const deny: string[] = [];
  const re =
    /\{\s*(?:action\s*=\s*["'](allow|deny)["']|"action"\s*:\s*"(allow|deny)")\s*,\s*(?:tool\s*=\s*["']([^"']+)["']|"tool"\s*:\s*"([^"]+)")(?:\s*,\s*(?:pattern\s*=\s*["']([^"']*)["']|"pattern"\s*:\s*"([^"]*)"))?\s*\}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const action = (m[1] || m[2] || "").toLowerCase();
    const tool = m[3] || m[4] || "";
    const pattern = m[5] || m[6];
    if (!tool) continue;
    const item = formatStructured(tool, pattern);
    if (action === "allow") allow.push(item);
    else if (action === "deny") deny.push(item);
  }
  return { allow, deny };
}

function extractLineRules(text: string): PermissionRuleSet {
  const allow: string[] = [];
  const deny: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const hash = raw.indexOf("#");
    const line = (hash >= 0 ? raw.slice(0, hash) : raw).trim();
    if (!line) continue;
    const m = /^(allow|deny)\s+(?![:=])(.+)$/i.exec(line);
    if (!m) continue;
    const rest = m[2]!.trim();
    if (!rest || rest.startsWith("[")) continue;
    if (m[1]!.toLowerCase() === "allow") allow.push(rest);
    else deny.push(rest);
  }
  return { allow, deny };
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

/** True when the text looks like permission.toml / allow-deny config. */
export function looksLikePermissionRules(text: string): boolean {
  return (
    /(?:^|[\n;{,])\s*(?:[\w.]+\.)?(allow|deny)\s*[=:]/im.test(text) ||
    /"(allow|deny)"\s*:/i.test(text) ||
    /(?:^|\n)\s*(allow|deny)\s+(?![:=])\S/im.test(text) ||
    /action\s*=\s*["'](allow|deny)["']/i.test(text) ||
    /"action"\s*:\s*"(allow|deny)"/i.test(text)
  );
}

/**
 * Pull allow/deny entries from compact arrays, single-string assignments,
 * structured `{ action, tool, pattern }` tables, or bare `allow …` / `deny …` lines.
 */
export function parsePermissionRules(text: string): PermissionRuleSet {
  const structured = extractStructured(text);
  const lines = extractLineRules(text);
  return {
    allow: unique([
      ...extractKeyedArrays(text, "allow"),
      ...extractKeyedStrings(text, "allow"),
      ...structured.allow,
      ...lines.allow,
    ]),
    deny: unique([
      ...extractKeyedArrays(text, "deny"),
      ...extractKeyedStrings(text, "deny"),
      ...structured.deny,
      ...lines.deny,
    ]),
  };
}
