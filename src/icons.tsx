/** Single catalog: Tabler Icons. See `.cursor/rules/tabler-icons.mdc`. */
import type { TablerIcon } from "@tabler/icons-react";
import {
  IconAlertTriangle as TablerAlertTriangle,
  IconArrowBackUp,
  IconArrowUp,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconBaselineDensityMedium as TablerDensity,
  IconBell as TablerBell,
  IconBookmark as TablerBookmark,
  IconBulb,
  IconBook2,
  IconChartBar,
  IconCheck as TablerCheck,
  IconChevronDown,
  IconChevronLeft as TablerChevronLeft,
  IconChevronRight as TablerChevronRight,
  IconChevronUp as TablerChevronUp,
  IconCircle,
  IconCircleCheck,
  IconCircleDot,
  IconCode as TablerCode,
  IconCopy as TablerCopy,
  IconDeviceFloppy,
  IconDots,
  IconExternalLink,
  IconEye as TablerEye,
  IconFileSearch as TablerFileSearch,
  IconFileText,
  IconFileTypeDoc as TablerFileDoc,
  IconFileTypePdf as TablerFilePdf,
  IconFileTypePpt as TablerFilePpt,
  IconFileTypeXls as TablerFileXls,
  IconFileTypeZip as TablerFileZip,
  IconFilter as TablerFilter,
  IconFolder as TablerFolder,
  IconFolderOpen as TablerFolderOpen,
  IconFolderPlus as TablerFolderPlus,
  IconChecklist as TablerChecklist,
  IconColumns2 as TablerColumns2,
  IconGitBranch,
  IconGitFork as TablerGitFork,
  IconHierarchy2 as TablerHierarchy2,
  IconLayoutDashboard,
  IconLayoutSidebar,
  IconLayoutSidebarRight,
  IconListDetails as TablerListDetails,
  IconList as TablerList,
  IconMarkdown as TablerMarkdown,
  IconMessageCircle,
  IconMessagePlus as TablerMessagePlus,
  IconMinus as TablerMinus,
  IconMoon as TablerMoon,
  IconPencil,
  IconPaperclip as TablerPaperclip,
  IconPhoto as TablerPhoto,
  IconPlayerPlay as TablerPlayerPlay,
  IconPlayerStop,
  IconPlug as TablerPlug,
  IconPlus as TablerPlus,
  IconRefresh as TablerRefresh,
  IconRobot as TablerRobot,
  IconSearch as TablerSearch,
  IconSettings,
  IconShieldCheck as TablerShieldCheck,
  IconStar as TablerStar,
  IconStarFilled as TablerStarFilled,
  IconSun as TablerSun,
  IconTerminal2,
  IconThumbDown as TablerThumbDown,
  IconThumbUp as TablerThumbUp,
  IconWand as TablerWand,
  IconWorld as TablerWorld,
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
export const IconPaperclip = wrap(TablerPaperclip);
export const IconChevron = wrap(IconChevronDown, 12);
export const IconChevronUp = wrap(TablerChevronUp, 12);
export const IconChevronLeft = wrap(TablerChevronLeft, 12);
export const IconChevronRight = wrap(TablerChevronRight, 12);
export const IconFolder = wrap(TablerFolder);
export const IconFolderOpen = wrap(TablerFolderOpen);
export const IconFolderPlus = wrap(TablerFolderPlus);
export const IconChat = wrap(IconMessageCircle);
export const IconMore = wrap(IconDots);
export const IconCopy = wrap(TablerCopy);
export const IconUp = wrap(IconArrowUp);
export const IconFinder = wrap(IconExternalLink);
export const IconEye = wrap(TablerEye, 14);
export const IconDashboard = wrap(IconLayoutDashboard, 16);
export const IconPanel = wrap(IconLayoutSidebarRight);
export const IconSidebar = wrap(IconLayoutSidebar, 18);
export const IconGear = wrap(IconSettings);
export const IconSearch = wrap(TablerSearch);
export const IconBell = wrap(TablerBell);
export const IconWorld = wrap(TablerWorld);
export const IconAlert = wrap(TablerAlertTriangle, 14);
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
export const IconBook = wrap(IconBook2, 18);
export const IconBookmark = wrap(TablerBookmark, 14);
export const IconRobot = wrap(TablerRobot, 14);
export const IconChecklist = wrap(TablerChecklist);
export const IconHierarchy2 = wrap(TablerHierarchy2);
export const IconShieldCheck = wrap(TablerShieldCheck, 14);
export const IconFileSearch = wrap(TablerFileSearch);
export const IconFileTxt = wrap(IconFileText);
export const IconFilePdf = wrap(TablerFilePdf, 22);
export const IconFileDoc = wrap(TablerFileDoc, 22);
export const IconFileXls = wrap(TablerFileXls, 22);
export const IconFilePpt = wrap(TablerFilePpt, 22);
export const IconFileZip = wrap(TablerFileZip, 22);
export const IconPhoto = wrap(TablerPhoto, 22);
export const IconPlayerPlay = wrap(TablerPlayerPlay, 22);
export const IconStop = wrap(IconPlayerStop);
export const IconSave = wrap(IconDeviceFloppy);
export const IconCode = wrap(TablerCode);
export const IconMarkdown = wrap(TablerMarkdown);
export const IconListDetails = wrap(TablerListDetails);
export const IconList = wrap(TablerList, 14);
export const IconColumns = wrap(TablerColumns2, 14);
export const IconMinus = wrap(TablerMinus, 12);
export const IconAsk = wrap(TablerMessagePlus, 12);
export const IconWand = wrap(TablerWand, 14);
export const IconMaximize = wrap(IconArrowsMaximize);
export const IconMinimize = wrap(IconArrowsMinimize);
export const IconDensity = wrap(TablerDensity, 16);
export const IconTodoOff = wrap(IconCircle);
export const IconTodoOn = wrap(IconCircleCheck);
export const IconTodoBusy = wrap(IconCircleDot);
export const IconThumbUp = wrap(TablerThumbUp);
export const IconThumbDown = wrap(TablerThumbDown);
