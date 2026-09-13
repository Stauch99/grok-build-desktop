import { useRef, useState } from "react";
import { queueLabel, type QueueState } from "../lib/prompt-queue";
import { useLocale, useT } from "../lib/locale-context";
import { applyImeComposition, emptyImeEnterState, imeBlocksEnter } from "../lib/ime-enter";

export type QueueStripProps = {
  queue: QueueState;
  onRemove: (id: number) => void;
  onReorder?: (from: number, to: number) => void;
  onEdit?: (id: number, text: string) => void;
};

export function QueueStrip({ queue, onRemove, onReorder, onEdit }: QueueStripProps) {
  const imeRef = useRef(emptyImeEnterState());
  const dragFromRef = useRef<number | null>(null);
  const queueDraggedRef = useRef(false);
  const [editQueuedId, setEditQueuedId] = useState<number | null>(null);
  const [editQueuedText, setEditQueuedText] = useState("");
  const t = useT();
  const locale = useLocale();
  const label = queueLabel(queue, locale);

  if (queue.items.length === 0) return null;

  return (
    <div className="queue-strip" aria-label={t("queue.strip")}>
      <span className="queue-count">{label}</span>
      {queue.items.map((q, i) =>
        editQueuedId === q.id ? (
          <input
            key={q.id}
            className="queue-edit"
            value={editQueuedText}
            aria-label={t("queue.edit")}
            autoFocus
            onChange={(e) => setEditQueuedText(e.target.value)}
            onBlur={() => {
              onEdit?.(q.id, editQueuedText);
              setEditQueuedId(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (
                  imeBlocksEnter(
                    {
                      key: e.key,
                      isComposing: e.nativeEvent.isComposing,
                      keyCode: e.nativeEvent.keyCode,
                    },
                    imeRef.current,
                    Date.now(),
                  )
                ) {
                  return;
                }
                e.preventDefault();
                onEdit?.(q.id, editQueuedText);
                setEditQueuedId(null);
              }
              if (e.key === "Escape") setEditQueuedId(null);
            }}
            onCompositionStart={() => {
              imeRef.current = applyImeComposition(imeRef.current, "start", Date.now());
            }}
            onCompositionEnd={() => {
              imeRef.current = applyImeComposition(imeRef.current, "end", Date.now());
            }}
          />
        ) : (
          <div
            key={q.id}
            className="queue-item"
            draggable={!!onReorder}
            onDragStart={(e) => {
              if (!onReorder) return;
              queueDraggedRef.current = false;
              dragFromRef.current = i;
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(i));
            }}
            onDragOver={(e) => {
              if (!onReorder) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              if (!onReorder) return;
              e.preventDefault();
              e.stopPropagation();
              const from =
                dragFromRef.current ?? Number.parseInt(e.dataTransfer.getData("text/plain"), 10);
              if (Number.isNaN(from) || from === i) return;
              queueDraggedRef.current = true;
              onReorder(from, i);
              dragFromRef.current = null;
            }}
            onDragEnd={() => {
              dragFromRef.current = null;
            }}
          >
            <button
              type="button"
              className="queue-text"
              aria-label={t("queue.queued", { text: q.text })}
              onDoubleClick={() => {
                setEditQueuedId(q.id);
                setEditQueuedText(q.text);
              }}
              onKeyDown={(e) => {
                if (!onReorder || !e.altKey) return;
                if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                e.preventDefault();
                const to = e.key === "ArrowUp" ? i - 1 : i + 1;
                onReorder(i, to);
              }}
            >
              {q.text}
            </button>
            <button
              type="button"
              className="queue-x"
              aria-label={t("queue.remove")}
              onClick={() => onRemove(q.id)}
            >
              ×
            </button>
          </div>
        ),
      )}
    </div>
  );
}
