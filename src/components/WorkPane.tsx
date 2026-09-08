import type { ReactNode } from "react";

/**
 * Shared pane chrome. Split and solo both render through this shell so
 * rewind / fork / jobs / grants / hang recovery stay first-class.
 */
export function WorkPane({
  focused,
  paneId,
  onFocus,
  className,
  children,
}: {
  focused: boolean;
  paneId: string;
  onFocus: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`pane${focused ? " is-focused" : ""}${className ? ` ${className}` : ""}`}
      data-pane-id={paneId}
      onPointerDown={onFocus}
      onFocusCapture={onFocus}
    >
      {children}
    </div>
  );
}
