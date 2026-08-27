import { useEffect, useId, useRef, useState } from "react";
import { IconCheck, IconChevron } from "../icons";

export type MenuSelectOption<T extends string> = {
  value: T;
  label: string;
  hint?: string;
};

export type MenuSelectProps<T extends string> = {
  value: T;
  options: MenuSelectOption<T>[];
  onChange: (next: T) => void;
  /** Accessible name. Rendered by the caller's own label element. */
  ariaLabel: string;
  disabled?: boolean;
  title?: string;
  /** `field` fills its container (Settings rows); `inline` hugs its text. */
  variant?: "field" | "inline";
  className?: string;
};

/**
 * Replacement for a native `<select>`.
 *
 * A tray icon makes WKWebView's native select unreadable to VoiceOver on macOS
 * (tauri#15221), and this app ships a tray. This uses the same listbox pattern
 * as the composer chips so every picker in the app behaves identically and
 * stays keyboard- and screen-reader-navigable.
 */
export function MenuSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled,
  title,
  variant = "field",
  className,
}: MenuSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const current = options.find((o) => o.value === value);
  const hasHints = options.some((o) => o.hint);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const commit = (next: T) => {
    setOpen(false);
    if (next !== value) onChange(next);
  };

  return (
    <div className={`menu-select ${variant}${className ? ` ${className}` : ""}`} ref={wrapRef}>
      <button
        type="button"
        className="menu-select-btn"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        title={title}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="menu-select-value">{current?.label ?? value}</span>
        <IconChevron size={11} />
      </button>

      {open && (
        <div
          className={`chip-menu menu-select-list${hasHints ? " menu-hint-menu" : ""}`}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          ref={(el) => el?.focus()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % options.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i - 1 + options.length) % options.length);
              return;
            }
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              const opt = options[active];
              if (opt) commit(opt.value);
            }
          }}
        >
          {options.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={i === active ? "on" : undefined}
              title={o.hint || o.label}
              onMouseEnter={() => setActive(i)}
              onClick={() => commit(o.value)}
            >
              {hasHints ? (
                <>
                  <span className="menu-hint-label">{o.label}</span>
                  {o.hint ? <span className="menu-hint-text">{o.hint}</span> : null}
                  <span className="menu-hint-check" aria-hidden>
                    {o.value === value ? <IconCheck size={14} /> : null}
                  </span>
                </>
              ) : (
                <span className="mode-row">
                  <span>{o.label}</span>
                  <span>{o.value === value ? <IconCheck size={12} /> : null}</span>
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
