import { useT } from "../lib/locale-context";
import { DockCapsule } from "./ComposerDock";

export type RecapCardProps = {
  text: string;
  onDismiss: () => void;
};

/** Grok's last-turn recap, stacked in the composer dock until dismissed. */
export function RecapCard({ text, onDismiss }: RecapCardProps) {
  const t = useT();
  return (
    <DockCapsule
      variant="card"
      kicker={t("recap.kicker")}
      onDismiss={onDismiss}
      dismissLabel={t("recap.dismiss")}
      className="recap-card"
      label={t("recap.label")}
    >
      <p>{text}</p>
    </DockCapsule>
  );
}
