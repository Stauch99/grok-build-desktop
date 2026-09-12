import { derivePermissionView, type PermissionViewInput } from "./permission-view";
import type { QueuedPermission } from "./permission-queue";

type PermissionContext = Omit<PermissionViewInput, "request">;

/**
 * Live (non-timed-out) requests waiting behind each pane's visible card.
 * The card slot already shows one, so the badge counts the rest.
 */
export function pendingExtraByPane(
  queue: readonly QueuedPermission[],
  context: PermissionContext,
): Record<string, number> {
  const routed: Record<string, number> = {};
  for (const request of queue) {
    if (request.timedOut) continue;
    const pane = derivePermissionView({ ...context, request }).pane;
    if (!pane) continue;
    routed[pane] = (routed[pane] ?? 0) + 1;
  }
  const out: Record<string, number> = {};
  for (const [pane, n] of Object.entries(routed)) out[pane] = Math.max(0, n - 1);
  return out;
}
