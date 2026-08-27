import { useEffect, useRef, useState } from "react";

export type AccountMenuProps = {
  signedIn: boolean;
  onSettings: () => void;
  onExtensions: () => void;
  onShortcuts: () => void;
};

export function AccountMenu({ signedIn, onSettings, onExtensions, onShortcuts }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(fn: () => void) {
    setOpen(false);
    fn();
  }

  return (
    <div className="side-account" ref={wrapRef}>
      <button
        type="button"
        className="account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="account-avatar" aria-hidden />
        {signedIn ? "已登录" : "未登录"}
      </button>
      {open ? (
        <div className="menu account-pop" role="menu">
          <button type="button" role="menuitem" onClick={() => pick(onSettings)}>
            设置
          </button>
          <button type="button" role="menuitem" onClick={() => pick(onExtensions)}>
            扩展中心
          </button>
          <button type="button" role="menuitem" onClick={() => pick(onShortcuts)}>
            快捷键
          </button>
        </div>
      ) : null}
    </div>
  );
}
