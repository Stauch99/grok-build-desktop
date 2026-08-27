import type { IIconProps } from "@icon-park/react/lib/runtime";
import {
  Branch,
  ChartHistogram,
  CheckSmall,
  Close,
  Comments,
  Copy,
  Down,
  Edit,
  Filter,
  FolderClose,
  FolderOpen,
  LayoutTwo,
  MacFinder,
  Moon,
  MoreOne,
  Plug,
  Plus,
  Redo,
  Search,
  Setting,
  Star,
  SunOne,
  Terminal,
  Undo,
  Up,
} from "@icon-park/react";

type Ico = { size?: number; className?: string };

type ParkIcon = (props: IIconProps) => React.ReactElement;

const park = {
  theme: "outline" as const,
  strokeWidth: 3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Nominal sizes from defaults/callers are scaled ~25% for IconPark outline fit. */
const ICON_SCALE = 0.75;

function renderSize(nominal: number): number {
  return Math.round(nominal * ICON_SCALE);
}

function wrap(Park: ParkIcon, defaultSize = 16) {
  return function Icon({ size = defaultSize, className }: Ico) {
    return <Park {...park} size={renderSize(size)} className={className} aria-hidden />;
  };
}

export const IconPlus = wrap(Plus);
export const IconChevron = wrap(Down, 12);
export const IconFolder = wrap(FolderClose);
export const IconFolderOpen = wrap(FolderOpen);
export const IconChat = wrap(Comments);
export const IconMore = wrap(MoreOne);
export const IconCopy = wrap(Copy);
export const IconUp = wrap(Up);
export const IconFinder = wrap(MacFinder);
export const IconPanel = wrap(LayoutTwo);
export const IconGear = wrap(Setting);
export const IconSearch = wrap(Search);
export const IconSpark = wrap(Star, 22);
export const IconCheck = wrap(CheckSmall, 12);
export const IconChart = wrap(ChartHistogram, 22);
export const IconSun = wrap(SunOne);
export const IconMoon = wrap(Moon);
export const IconBranch = wrap(Branch, 14);
export const IconUndo = wrap(Undo, 14);
export const IconPlug = wrap(Plug, 14);
export const IconClose = wrap(Close);
export const IconResend = wrap(Redo, 14);
export const IconEdit = wrap(Edit, 14);
export const IconFilter = wrap(Filter);
export const IconTerminal = wrap(Terminal);
