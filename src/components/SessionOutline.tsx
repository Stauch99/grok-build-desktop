import type { ChatItem } from "../lib/chat";

export type SessionOutlineProps = {
  turns: Extract<ChatItem, { kind: "user" }>[];
  onJump: (id: string) => void;
};

/** Readable list of user turns. Click jumps via `onJump` (wire to `jumpTurnId`). */
export function SessionOutline({ turns, onJump }: SessionOutlineProps) {
  if (turns.length === 0) {
    return <p className="session-outline-empty hint">还没有用户发言</p>;
  }
  return (
    <nav className="session-outline" aria-label="会话大纲">
      <ol>
        {turns.map((turn, i) => {
          const label = turn.text.replace(/\s+/g, " ").trim() || "（空）";
          return (
            <li key={turn.id}>
              <button
                type="button"
                className="session-outline-item"
                onClick={() => onJump(turn.id)}
                title={label}
              >
                <span className="session-outline-idx">{i + 1}</span>
                <span className="session-outline-text">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
