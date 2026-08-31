import { IconCheck, IconChevron } from "../icons";
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
          aria-label={t("composer.mode")}
          title={t("composer.mode")}
          aria-expanded={modeOpen}
          onClick={onToggleMode}
        >
          {modeLabel(mode, locale)} <kbd className="chip-kbd">⇧Tab</kbd> <IconChevron size={11} />
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
          aria-label="切换默认模型"
          aria-expanded={modelOpen}
          title={
            differs
              ? `本会话运行在 ${sessionModel}，默认模型是 ${model}`
              : "默认模型"
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
              在设置中管理…
            </button>
          </div>
        )}
      </div>

      {showEffort ? (
        <div className="chip-wrap">
          <button
            type="button"
            className="effort-chip"
            aria-label="推理力度"
            title="推理力度（写入默认设置）"
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
