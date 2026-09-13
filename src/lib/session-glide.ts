export type GlideBox = {
  getBoundingClientRect(): { top: number; height: number };
};

export type GlideListBox = GlideBox & { scrollTop: number };

/** List-relative Y/height for `.session-glide` (absolute against `.session-list`). */
export function sessionGlideMetrics(list: GlideListBox, item: GlideBox): { y: number; h: number } {
  const listRect = list.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  return {
    y: itemRect.top - listRect.top + list.scrollTop,
    h: itemRect.height,
  };
}
