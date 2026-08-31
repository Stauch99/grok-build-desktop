import { useEffect, useMemo, useRef, useState } from "react";
import { loadLocalPaletteFrecency, recordLocalPaletteUse, type FrecencyMap } from "../lib/frecency";
import { filterPalette, paletteKey, type PaletteItem } from "../lib/palette";
import { trapFocus } from "../lib/trap-focus";
import { useT } from "../lib/locale-context";
import { bindingFor, formatBinding } from "../lib/shortcuts-table";
import { useShortcutState } from "./ShortcutHint";

export type CommandPaletteProps = {
  items: PaletteItem[];
  onPick: (id: string) => void;
  onSearch: (query: string) => void;
  onClose: () => void;
};

/**
 * ⌘K launcher over sessions, projects, slash commands and app actions.
 * Owns only its query and highlight; every action is resolved by id in App.
 */
export function CommandPalette({ items, onPick, onSearch, onClose }: CommandPaletteProps) {
  const t = useT();
  const { overrides, mac } = useShortcutState();
  const paletteChord = formatBinding(bindingFor(overrides, "palette"), mac);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [frecency, setFrecency] = useState<FrecencyMap>(loadLocalPaletteFrecency);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const previousActive = useRef<HTMLElement | null>(null);

  const hits = useMemo(() => filterPalette(items, query, 40, frecency), [items, query, frecency]);

  function execute(id: string) {
    setFrecency(recordLocalPaletteUse(id));
    onPick(id);
  }

  useEffect(() => {
    previousActive.current =
      typeof document !== "undefined" && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const first =
      layerRef.current?.querySelector<HTMLElement>(
        'input, button, [href], [tabindex]:not([tabindex="-1"])',
      ) ?? inputRef.current;
    first?.focus();
    return () => {
      const el = previousActive.current;
      if (el?.isConnected) el.focus();
    };
  }, []);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${index}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [index, hits.length]);

  let lastGroup = "";

  return (
    <div
      ref={layerRef}
      className="palette-layer"
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
      onKeyDown={(e) => {
        if (e.key === "Tab" && layerRef.current) trapFocus(layerRef.current, e.nativeEvent);
      }}
    >
      <div className="palette-backdrop" onClick={onClose} />
      <div className="palette">
        <input
          ref={inputRef}
          className="palette-input"
          value={query}
          placeholder="跳转会话、切换项目、运行命令…"
          aria-label="搜索命令"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Escape" && e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return;
            e.preventDefault();
            const next = paletteKey({ index, hits, query }, e.key);
            if (next.index !== index) setIndex(next.index);
            if (next.action === "close") onClose();
            if (next.action === "pick" && next.id) execute(next.id);
            if (next.action === "search" && next.search) onSearch(next.search);
          }}
        />
        <div className="palette-list" ref={listRef} role="listbox">
          {hits.length === 0 && <p className="palette-empty">没有匹配项</p>}
          {hits.map((hit, i) => {
            const GROUP_KEYS: Record<string, string> = {
              "操作": "palette.group.actions",
              "会话": "palette.group.sessions",
              "项目": "palette.group.projects",
              "命令": "palette.group.commands",
            };
            const header = hit.group !== lastGroup ? hit.group : null;
            lastGroup = hit.group;
            return (
              <div key={hit.id}>
                {header && <div className="palette-group">{t(GROUP_KEYS[header] ?? header)}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === index}
                  data-row={i}
                  className={`palette-row${i === index ? " on" : ""}`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => execute(hit.id)}
                >
                  <span className="palette-label">{hit.label}</span>
                  {hit.hint && <span className="palette-hint">{hit.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <kbd>{paletteChord}</kbd> 打开 · <kbd>Esc</kbd> 关闭 · <kbd>↑↓</kbd> 选择 · <kbd>Enter</kbd> 执行
        </div>
      </div>
    </div>
  );
}
