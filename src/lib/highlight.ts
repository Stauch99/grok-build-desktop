export type HighlightKind = "kw" | "str" | "cmt" | "plain";
export type HighlightToken = { text: string; kind: HighlightKind };
export type HighlightLang = "ts" | "tsx" | "js" | "jsx" | "py" | "rs" | "json" | "md";

const LANGS = new Set<HighlightLang>(["ts", "tsx", "js", "jsx", "py", "rs", "json", "md"]);

const JS_KW = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while", "do",
  "class", "import", "export", "from", "as", "async", "await", "new", "this",
  "type", "interface", "extends", "implements", "true", "false", "null", "undefined",
  "void", "of", "in", "try", "catch", "finally", "throw", "switch", "case", "break",
  "continue", "default", "typeof", "instanceof", "enum", "namespace", "declare",
  "public", "private", "protected", "static", "readonly", "abstract", "string",
  "number", "boolean", "any", "never", "unknown", "bigint", "symbol", "object",
]);

const PY_KW = new Set([
  "def", "class", "return", "if", "elif", "else", "for", "while", "import", "from",
  "as", "with", "try", "except", "finally", "raise", "True", "False", "None", "and",
  "or", "not", "in", "is", "lambda", "yield", "async", "await", "pass", "break",
  "continue", "global", "nonlocal",
]);

const RS_KW = new Set([
  "fn", "let", "mut", "const", "if", "else", "for", "while", "loop", "match",
  "return", "struct", "enum", "impl", "trait", "pub", "use", "mod", "crate", "self",
  "Self", "async", "await", "true", "false", "where", "type", "ref", "move",
]);

const JSON_KW = new Set(["true", "false", "null"]);

export function highlightLang(path: string): HighlightLang | null {
  const base = path.replace(/\/+$/, "").split("/").pop() || path;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  return LANGS.has(ext as HighlightLang) ? (ext as HighlightLang) : null;
}

export function highlight(text: string, lang: HighlightLang): HighlightToken[] {
  if (lang === "md") return highlightMd(text);
  if (lang === "py") return tokenize(text, PY_KW, { line: "#", strings: ["'", '"'] });
  if (lang === "rs") return tokenize(text, RS_KW, { line: "//", block: true, strings: ['"'] });
  if (lang === "json") return tokenize(text, JSON_KW, { strings: ['"'] });
  return tokenize(text, JS_KW, { line: "//", block: true, strings: ['"', "'", "`"] });
}

export function tokensToLines(tokens: HighlightToken[]): HighlightToken[][] {
  const lines: HighlightToken[][] = [[]];
  for (const tok of tokens) {
    const parts = tok.text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, kind: tok.kind });
    });
  }
  return lines;
}

function highlightMd(src: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  let i = 0;
  while (i < src.length) {
    const lineStart = i === 0 || src[i - 1] === "\n";
    if (lineStart && src[i] === "#") {
      let end = i + 1;
      while (end < src.length && src[end] !== "\n") end++;
      tokens.push({ text: src.slice(i, end), kind: "kw" });
      i = end;
      continue;
    }
    if (src[i] === "`") {
      let end = i + 1;
      while (end < src.length && src[end] !== "`") end++;
      if (end < src.length) end++;
      tokens.push({ text: src.slice(i, end), kind: "str" });
      i = end;
      continue;
    }
    let end = i + 1;
    while (end < src.length) {
      const nextLine = src[end - 1] === "\n";
      if ((nextLine && src[end] === "#") || src[end] === "`") break;
      end++;
    }
    tokens.push({ text: src.slice(i, end), kind: "plain" });
    i = end;
  }
  return tokens;
}

function tokenize(
  src: string,
  keywords: Set<string>,
  opts: { line?: string; block?: boolean; strings: string[] },
): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  let i = 0;
  const push = (text: string, kind: HighlightKind) => {
    if (!text) return;
    const last = tokens[tokens.length - 1];
    if (last && last.kind === kind && kind === "plain") last.text += text;
    else tokens.push({ text, kind });
  };

  while (i < src.length) {
    if (opts.block && src.startsWith("/*", i)) {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      push(src.slice(i, stop), "cmt");
      i = stop;
      continue;
    }
    if (opts.line && src.startsWith(opts.line, i)) {
      let end = i + opts.line.length;
      while (end < src.length && src[end] !== "\n") end++;
      push(src.slice(i, end), "cmt");
      i = end;
      continue;
    }
    const quote = opts.strings.find((q) => src[i] === q);
    if (quote) {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === quote) {
          j++;
          break;
        }
        j++;
      }
      push(src.slice(i, j), "str");
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(src[i])) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      const word = src.slice(i, j);
      push(word, keywords.has(word) ? "kw" : "plain");
      i = j;
      continue;
    }
    push(src[i], "plain");
    i++;
  }
  return tokens;
}
