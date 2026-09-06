import { IconCheck, IconChevron, IconListDetails, IconRobot, IconShieldCheck } from "../icons";
import { effortLabel, effortMenuOptions } from "../lib/effort";
import { modeLabel, modeNeedsConfirm, modeOptions, type Mode } from "../lib/mode";
import { useLocale, useT } from "../lib/locale-context";

export type ComposerChipsProps = {
  mode: Mode;
  onMode: (next: Mode) => void;
  modeOpen: boolean;
  onToggleMode: () => void;
  onArmMode: (next: Mode) => void;

  effort: string;
  onEffort: (next: string) => void;
  effortReady: boolean;
  effortOptions: string[];
  effortOpen: boolean;
  onToggleEffort: () => void;

  model: string;
  sessionModel?: string | null;
  modelOptions: string[];
  modelLabels?: Record<string, string>;
  modelOpen: boolean;
  onToggleModel: () => void;
  onPickModel: (next: string) => void;
  onOpenSettings: () => void;
};

function ModeIcon({ mode }: { mode: Mode }) {
  if (mode === "plan") return <IconListDetails size={14} />;
  if (mode === "yolo") return <IconShieldCheck size={14} />;
  return <IconRobot size={14} />;
}

export function ComposerChips({
  mode,
  onMode,
  modeOpen,
  onToggleMode,
  onArmMode,
  effort,
  onEffort,
  effortReady,
  effortOptions,
  effortOpen,
  onToggleEffort,
  model,
  sessionModel,
  modelOptions,
  modelLabels,
  modelOpen,
  onToggleModel,
  onPickModel,
  onOpenSettings,
}: ComposerChipsProps) {
  const t = useT();
  const locale = useLocale();
  const differs = !!sessionModel && sessionModel !== model;
  const options = Array.from(new Set([model, ...modelOptions])).filter(Boolean);
  const effortMenu = effortMenuOptions(effortOptions);
  const showEffort = effortReady && effortOptions.length > 0;

  return (
    <>
      <div className="chip-wrap">
        <button
          type="button"
          className={`mode-chip${mode === "yolo" ? " yolo" : ""}`}
          aria-label={`${modeLabel(mode, locale)} · ${t("composer.mode")}`}
          data-tip={modeLabel(mode, locale)}
          aria-expanded={modeOpen}
          onClick={onToggleMode}
        >
          <ModeIcon mode={mode} />
          <IconChevron size={11} />
        </button>
        {modeOpen && (
          <div className="chip-menu mode-menu" role="menu">
            {modeOptions(locale).map((o) => (
              <button
                key={o.id}
                type="button"
                className={o.id === "yolo" ? "yolo" : undefined}
                onClick={() => {
                  if (modeNeedsConfirm(mode, o.id)) {
                    onArmMode(o.id);
                    return;
                  }
                  onMode(o.id);
                }}
              >
                <span className="mode-row">
                  <span>{o.label}</span>
                  <span>{o.id === mode ? <IconCheck size={12} /> : null}</span>
                </span>
                <span className="hint">{o.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="chip-wrap">
        <button
          type="button"
          className={`model-chip${differs ? " differs" : ""}`}
          aria-label={t("composer.switchModel")}
          aria-expanded={modelOpen}
          data-tip={
            differs
              ? t("composer.modelSession", { session: sessionModel ?? "", model })
              : t("composer.modelDefault")
          }
          onClick={onToggleModel}
        >
          {modelLabels?.[sessionModel || model] || sessionModel || model} <IconChevron size={11} />
        </button>
        {modelOpen && (
          <div className="chip-menu model-menu" role="menu">
            {options.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onPickModel(m)}
              >
                <span className="mode-row">
                  <span>{modelLabels?.[m] || m}</span>
                  <span>{m === model ? <IconCheck size={12} /> : null}</span>
                </span>
              </button>
            ))}
            <div className="sep" />
            <button type="button" onClick={onOpenSettings}>
              {t("composer.manageInSettings")}
            </button>
          </div>
        )}
      </div>

      {showEffort ? (
        <div className="chip-wrap">
          <button
            type="button"
            className="effort-chip"
            aria-label={t("settings.effort")}
            data-tip={t("composer.effortHint")}
            aria-expanded={effortOpen}
            onClick={onToggleEffort}
          >
            {effortLabel(effort)} <IconChevron size={11} />
          </button>
          {effortOpen && (
            <div className="chip-menu effort-menu menu-hint-menu" role="menu">
              {effortMenu.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onEffort(o.id)}
                >
                  <span className="menu-hint-label">{o.label}</span>
                  <span className="menu-hint-text">{o.hint}</span>
                  <span className="menu-hint-check" aria-hidden>
                    {o.id === effort ? <IconCheck size={14} /> : null}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
