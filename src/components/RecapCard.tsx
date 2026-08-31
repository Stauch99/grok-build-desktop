import { DockCapsule } from "./ComposerDock";

export type RecapCardProps = {
  text: string;
  onDismiss: () => void;
};

/** Grok's last-turn recap, stacked in the composer dock until dismissed. */
export function RecapCard({ text, onDismiss }: RecapCardProps) {
  return (
    <DockCapsule
      variant="card"
      kicker="回顾"
      onDismiss={onDismiss}
      dismissLabel="关闭回顾"
      className="recap-card"
      label="对话回顾"
    >
      <p>{text}</p>
    </DockCapsule>
  );
}
