import type { TablerIcon } from "@tabler/icons-react";
import {
  IconArrowBackUp,
  IconArrowUp,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconBulb,
  IconChartBar,
  IconCheck as TablerCheck,
  IconChevronDown,
  IconChevronUp as TablerChevronUp,
  IconCircle,
  IconCircleCheck,
  IconCircleDot,
  IconCode as TablerCode,
  IconCopy as TablerCopy,
  IconDeviceFloppy,
  IconDots,
  IconExternalLink,
  IconFileSearch as TablerFileSearch,
  IconFileText,
  IconFilter as TablerFilter,
  IconFolder as TablerFolder,
  IconFolderOpen as TablerFolderOpen,
  IconFolderPlus as TablerFolderPlus,
  IconGitBranch,
  IconGitFork as TablerGitFork,
  IconLayoutSidebar,
  IconLayoutSidebarRight,
  IconListDetails as TablerListDetails,
  IconMarkdown as TablerMarkdown,
  IconMessageCircle,
  IconMoon as TablerMoon,
  IconPencil,
  IconPlayerStop,
  IconPlug as TablerPlug,
  IconPlus as TablerPlus,
  IconRefresh as TablerRefresh,
  IconSearch as TablerSearch,
  IconSettings,
  IconStar as TablerStar,
  IconStarFilled as TablerStarFilled,
  IconSun as TablerSun,
  IconTerminal2,
  IconThumbDown as TablerThumbDown,
  IconThumbUp as TablerThumbUp,
  IconX,
} from "@tabler/icons-react";

export type Ico = { size?: number; className?: string };

function wrap(Tabler: TablerIcon, defaultSize = 16, stroke: number | undefined = 1.75) {
  return function Icon({ size = defaultSize, className }: Ico) {
    return (
      <Tabler
        size={size}
        stroke={stroke}
        className={className ? `grok-ico ${className}` : "grok-ico"}
        aria-hidden
      />
    );
  };
}

export const IconPlus = wrap(TablerPlus);
export const IconChevron = wrap(IconChevronDown, 12);
export const IconChevronUp = wrap(TablerChevronUp, 12);
export const IconFolder = wrap(TablerFolder);
export const IconFolderOpen = wrap(TablerFolderOpen);
export const IconFolderPlus = wrap(TablerFolderPlus);
export const IconChat = wrap(IconMessageCircle);
export const IconMore = wrap(IconDots);
export const IconCopy = wrap(TablerCopy);
export const IconUp = wrap(IconArrowUp);
export const IconFinder = wrap(IconExternalLink);
export const IconPanel = wrap(IconLayoutSidebarRight);
export const IconSidebar = wrap(IconLayoutSidebar, 18);
export const IconGear = wrap(IconSettings);
export const IconSearch = wrap(TablerSearch);
export const IconSpark = wrap(TablerStar, 22);
export const IconStar = wrap(TablerStar, 14);
export const IconStarFilled = wrap(TablerStarFilled, 14, undefined);
export const IconCheck = wrap(TablerCheck, 12);
export const IconChart = wrap(IconChartBar, 22);
export const IconSun = wrap(TablerSun);
export const IconMoon = wrap(TablerMoon);
export const IconBranch = wrap(IconGitBranch, 14);
export const IconGitFork = wrap(TablerGitFork);
export const IconUndo = wrap(IconArrowBackUp, 14);
export const IconPlug = wrap(TablerPlug, 14);
export const IconClose = wrap(IconX);
export const IconRefresh = wrap(TablerRefresh, 14);
export const IconResend = IconRefresh;
export const IconEdit = wrap(IconPencil, 14);
export const IconFilter = wrap(TablerFilter);
export const IconTerminal = wrap(IconTerminal2);
export const IconLight = wrap(IconBulb);
export const IconFileSearch = wrap(TablerFileSearch);
export const IconFileTxt = wrap(IconFileText);
export const IconStop = wrap(IconPlayerStop);
export const IconSave = wrap(IconDeviceFloppy);
export const IconCode = wrap(TablerCode);
export const IconMarkdown = wrap(TablerMarkdown);
export const IconListDetails = wrap(TablerListDetails);
export const IconMaximize = wrap(IconArrowsMaximize);
export const IconMinimize = wrap(IconArrowsMinimize);
export const IconTodoOff = wrap(IconCircle);
export const IconTodoOn = wrap(IconCircleCheck);
export const IconTodoBusy = wrap(IconCircleDot);
export const IconThumbUp = wrap(TablerThumbUp);
export const IconThumbDown = wrap(TablerThumbDown);
