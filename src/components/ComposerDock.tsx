import { Children, type ReactNode } from "react";
import { IconClose } from "../icons";

export function ComposerDock({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;
  return <div className="composer-dock">{items}</div>;
}

export type DockCapsuleProps = {
  kicker?: string;
  children: ReactNode;
  meta?: ReactNode;
  tone?: "neutral" | "live" | "ok" | "warn" | "danger";
  variant?: "pill" | "card";
  onDismiss?: () => void;
  dismissLabel?: string;
  actions?: ReactNode;
  className?: string;
  label?: string;
};

/** Slim pill or short card that stacks in ComposerDock above the input. */
export function DockCapsule({
  kicker,
  children,
  meta,
  tone = "neutral",
  variant = "pill",
  onDismiss,
  dismissLabel = "关闭",
  actions,
  className,
  label,
}: DockCapsuleProps) {
  const classes = [
    "dock-capsule",
    `dock-capsule-${variant}`,
    tone !== "neutral" ? `dock-capsule-${tone}` : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={classes}
      role={variant === "card" ? "complementary" : "status"}
      aria-label={label ?? kicker}
    >
      <div className="dock-capsule-row">
        {kicker ? <span className="dock-capsule-kicker">{kicker}</span> : null}
        {variant === "pill" ? <div className="dock-capsule-body">{children}</div> : null}
        {meta ? <span className="dock-capsule-meta">{meta}</span> : null}
        {actions}
        {onDismiss ? (
          <button
            type="button"
            className="icon-btn"
            onClick={onDismiss}
            title={dismissLabel}
            aria-label={dismissLabel}
          >
            <IconClose size={16} />
          </button>
        ) : null}
      </div>
      {variant === "card" ? <div className="dock-capsule-body">{children}</div> : null}
    </div>
  );
}
