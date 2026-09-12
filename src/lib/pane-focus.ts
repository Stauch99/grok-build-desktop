/** Composer steal is only for switching panes. Refocusing an active pane kills drag-select. */
export function shouldMoveComposerFocus(currentPaneId: string, nextPaneId: string): boolean {
  return currentPaneId !== nextPaneId;
}
