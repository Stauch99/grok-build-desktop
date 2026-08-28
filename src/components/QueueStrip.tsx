import { useRef, useState } from "react";
import { queueLabel, type QueueState } from "../lib/prompt-queue";

export type QueueStripProps = {
  queue: QueueState;
  onRemove: (id: number) => void;
  onReorder?: (from: number, to: number) => void;
  onEdit?: (id: number, text: string) => void;
};

export function QueueStrip({ queue, onRemove, onReorder, onEdit }: QueueStripProps) {
  const dragFromRef = useRef<number | null>(null);
  const queueDraggedRef = useRef(false);
  const [editQueuedId, setEditQueuedId] = useState<number | null>(null);
  const [editQueuedText, setEditQueuedText] = useState("");
  const label = queueLabel(queue);

  if (queue.items.length === 0) return null;

  return (
    <div className="queue-strip" aria-label="排队中的消息">
      <span className="queue-count">{label}</span>
      {queue.items.map((q, i) =>
        editQueuedId === q.id ? (
          <input
            key={q.id}
            className="queue-edit"
            value={editQueuedText}
            aria-label="编辑排队消息"
            autoFocus
            onChange={(e) => setEditQueuedText(e.target.value)}
            onBlur={() => {
              onEdit?.(q.id, editQueuedText);
              setEditQueuedId(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onEdit?.(q.id, editQueuedText);
                setEditQueuedId(null);
              }
              if (e.key === "Escape") setEditQueuedId(null);
            }}
          />
        ) : (
          <button
            key={q.id}
            type="button"
            className="queue-item"
            aria-label={`排队：${q.text}`}
            title={onReorder ? "拖动排序，双击编辑，点 × 移出" : "双击编辑，点 × 移出"}
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
            onDoubleClick={() => {
              setEditQueuedId(q.id);
              setEditQueuedText(q.text);
            }}
            onClick={(e) => {
              if (queueDraggedRef.current) {
                queueDraggedRef.current = false;
                return;
              }
              const t = e.target;
              if (t instanceof HTMLElement && t.classList.contains("queue-x")) {
                onRemove(q.id);
              }
            }}
          >
            <span className="queue-text">{q.text}</span>
            <span className="queue-x" aria-label="移出队列">
              ×
            </span>
          </button>
        ),
      )}
    </div>
  );
}
