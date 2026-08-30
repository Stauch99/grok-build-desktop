import { doctorOverviewLine } from "../lib/agent-port";
import type { AgentDoctor } from "../lib/agent-doctor";

export function DoctorsOverview({ doctors }: { doctors: AgentDoctor[] }) {
  if (!doctors.length) return null;
  return (
    <ul className="set-doctors">
      {doctors.map((d) => (
        <li key={d.agentId}>{doctorOverviewLine(d)}</li>
      ))}
    </ul>
  );
}
