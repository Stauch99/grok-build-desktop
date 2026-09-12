import { groupSidebarBands, isSidebarBandId, type SidebarSection } from "./sidebar-list";
import { parseGroupBandId } from "./project-groups";

/** Same threshold as the thread list: small sidebars stay fully in DOM. */
export const SIDEBAR_VIRTUALIZE_AFTER = 24;

export type SidebarListItem =
  | { kind: "band-label"; key: string; bandId: string }
  | { kind: "group-head"; key: string; groupId: string; label: string }
  | { kind: "section"; key: string; section: SidebarSection; grouped: boolean };

export function flattenSidebarListItems(
  sections: readonly SidebarSection[],
  openGroups: Record<string, boolean> = {},
): SidebarListItem[] {
  const items: SidebarListItem[] = [];
  for (const band of groupSidebarBands(sections)) {
    const groupId = parseGroupBandId(band.id);
    if (groupId) {
      items.push({ kind: "group-head", key: `group-${groupId}`, groupId, label: band.label });
    } else if (isSidebarBandId(band.id)) {
      items.push({ kind: "band-label", key: `band-${band.id}`, bandId: band.id });
    }
    const groupOpen = groupId ? openGroups[groupId] !== false : true;
    if (!groupOpen) continue;
    for (const section of band.sections) {
      if (section.kind === "group") continue;
      items.push({ kind: "section", key: section.id, section, grouped: !!groupId });
    }
  }
  return items;
}

export function shouldVirtualizeSidebar(items: readonly SidebarListItem[], after = SIDEBAR_VIRTUALIZE_AFTER): boolean {
  return items.length > after;
}
