import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type MsgMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
};

export type MessageContextMenuProps = {
  x: number;
  y: number;
  items: MsgMenuItem[];
  onClose: () => void;
};

const MENU_W = 220;
const ITEM_H = 30;

/**
 * Right-click menu for user/assistant rows. Reuses the shared `.menu` skin
 * (fixed position, dropdown z-index), clamps to the viewport, and closes on
 * Esc / click-away. Runs in a capture listener so the app-level Escape
 * hotkey does not also fire.
 */
export function MessageContextMenu({ x, y, items, onClose }: MessageContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const left = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - MENU_W - 8));
  const top = Math.min(
    Math.max(8, y),
    Math.max(8, window.innerHeight - items.length * ITEM_H - 20),
  );

  return createPortal(
    <div
      ref={ref}
      className="menu msg-menu"
      role="menu"
      style={{ top, left }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
