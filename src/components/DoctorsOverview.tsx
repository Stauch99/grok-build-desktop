import { doctorActionHint, type AgentDoctor } from "../lib/agent-doctor";
import { doctorOverviewLine } from "../lib/agent-port";
import { useT } from "../lib/locale-context";

export function DoctorsOverview({
  doctors,
  onCopied,
}: {
  doctors: AgentDoctor[];
  onCopied?: (cmd: string) => void;
}) {
  const t = useT();
  if (!doctors.length) return null;
  return (
    <ul className="set-doctors">
      {doctors.map((d) => {
        const hints = doctorActionHint(d);
        return (
          <li key={d.agentId} className="set-doctor">
            <p className="set-doctor-line">{doctorOverviewLine(d)}</p>
            {hints.length > 0 ? (
              <div className="set-doctor-hints">
                {hints.map((cmd) => (
                  <button
                    key={cmd}
                    type="button"
                    className="set-doctor-copy"
                    data-tip={t("git.copyCommand")}
                    onClick={() => {
                      void navigator.clipboard.writeText(cmd).then(() => onCopied?.(cmd));
                    }}
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
