export type RectLike = { left: number; top: number; right: number; bottom: number };

export function pointInRect(x: number, y: number, r: RectLike): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

/**
 * Tauri types DragDropEvent.position as physical pixels, but macOS wry reports
 * NSView logical points and wraps them as PhysicalPosition without multiplying
 * by scale. Try the payload as CSS pixels first, then as physical / DPR.
 */
export function dropPointHitsZone(
  x: number,
  y: number,
  zone: RectLike,
  devicePixelRatio: number,
): boolean {
  if (pointInRect(x, y, zone)) return true;
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  if (dpr === 1) return false;
  return pointInRect(x / dpr, y / dpr, zone);
}
