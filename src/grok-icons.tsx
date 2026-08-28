import {
  IconClose,
  IconCopy,
  IconEdit,
  IconMore,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSidebar,
  IconThumbDown,
  IconThumbUp,
  IconTodoBusy,
  IconTodoOff,
  IconTodoOn,
  type Ico,
} from "./icons";

export const IconGrokCopy = IconCopy;
export const IconGrokEdit = IconEdit;
export const IconGrokRegenerate = IconRefresh;
export const IconGrokMore = IconMore;
export const IconGrokSearch = IconSearch;
export const IconGrokPlus = IconPlus;
export const IconGrokClose = IconClose;
export { IconTodoOff, IconTodoOn, IconTodoBusy, IconThumbUp as IconGrokThumbUp, IconThumbDown as IconGrokThumbDown };

/** Sidebar collapse. `mirror` puts the rail on the right. */
export function IconGrokSidebar({ size = 18, mirror = false, className }: Ico & { mirror?: boolean }) {
  const cls = [mirror ? "mirror-x" : "", className].filter(Boolean).join(" ") || undefined;
  return <IconSidebar size={size} className={cls} />;
}
