# Cursor-inspired Agents shell for Grok Build Desktop

Date: 2026-08-27
Status: approved; implementation plan at `docs/superpowers/plans/2026-08-27-cursor-shell-ui.md`

## Goal

Restyle Grok Build Desktop to read as a Cursor Agents shell: three columns, a workspace list the user can regroup, a floating composer, a toggleable right tool pane, an account menu, and card-based in-app settings. Keep ACP/session routing, permission flow, split sessions, and the “not a full IDE” product boundary.

## Locked decisions

- Shell: Cursor Agents chrome. Do not ship an embedded browser or a PTY terminal.
- Default list grouping: by project (Workspace).
- List is user-configurable: grouping, ordering, pin session, pin project, per-row show flags.
- Settings stay in-app (overlay), restyled as left categories + search + card rows.
- Sidebar top actions: New Chat and Search only. Extensions and Settings live in the account menu.
- Theme: keep the existing light/dark toggle and current default.
- New chat cwd: last/current workspace; composer chip can switch project or inbox.
- Right pane: a chrome button shows or hides it. Open pane starts from a four-tile landing: 改动, 文件, 预览, 终端.

## Non-goals

- Full IDE, in-app Browser, in-app PTY.
- Cloud Environment, PR grouping, Source filters.
- New Automations product. “扩展中心” is the existing hub.
- Cursor iOS, Cursor log-out, or a fake cloud account name.
- Rewriting agent runtime, ACP process lifecycle, or `App.tsx` session routing.
- Changing split-session semantics. Split still forces the right pane closed.
- Batch-fetching token usage for every session from CLI on sidebar render.

## Architecture

Change the chrome in place. `App.tsx` keeps owning session load, ACP messages, permissions, and persistence. New pure list logic lives in `src/lib/sidebar-list.ts`. Review rail gains a landing tab and a terminal tab; it does not become a second layout system.

```
[ Sidebar ] [ Conversation + Composer ] [ Review pane | hidden ]
     |                |                         |
  webui.json      ACP/session              filePanelOpen
  list prefs      chat items               existing panels
```

State authority stays as today: list prefs, pins, last workspace, and last-known tokens in `~/.grok/webui.json`; models/effort/MCP in `config.toml`; live usage in session runtime.

## Shell layout

Three columns. Left sidebar always present (existing collapse-to-rail remains). Center is conversation. Right is the existing review column, user-toggled.

- Window grid still uses `SIDEBAR` / `PREVIEW` / `WORK_MIN` in `src/lib/layout.ts`.
- The main-chrome layout button toggles `review.open` (already persisted as `filePanelOpen`).
- First open in a workspace with no in-session review target shows the landing grid, not “进度”.
- Narrow windows still auto-collapse the right pane (`situationAutoCollapse`).

Visual language: light-gray side surfaces, white conversation, 12–16px radii on menus and cards, Inter + PingFang already in `styles.css`. Do not introduce a new typeface or a third theme family. Paper/Ink remain appearance settings, not the default shell.

## Left sidebar

### Top

Two labeled rows, Cursor-style (icon + text), not a cluster of icon-only traffic-light buttons:

1. 新对话 — existing `onNewChat`.
2. 搜索 — opens the command palette (same as `⌘K`). Palette items stay the same; restyle the overlay to match menus. Session full-text search stays on the palette path: a query of at least two characters that is not executed as a command still runs today’s `searchSessionText`. The always-visible sidebar search field is removed.

Connection status, theme toggle, and the old settings gear leave this header. Theme stays in Settings → 外观. Connection health stays in Settings → 总览.

### Account menu (bottom)

Row: generic avatar + identity text.

- Identity: `已登录` when `DoctorInfo.authPresent`, else `未登录`. No OS username scrape.
- Menu: 设置, 扩展中心, 快捷键 (opens Settings on the shortcuts block). No iOS, Docs, Contact, or Log Out.

### List manager

Heading 工作区 with a trailing filter-lines button. Menu:

| Block | Control | Values | Default |
|---|---|---|---|
| 分组 | exclusive | `project` / `updated` / `status` | `project` |
| 排序 | exclusive | `updated` / `title` | `updated` |
| 显示 | multi | `tokens`, `status`, `worktree` | `status` on; `tokens` and `worktree` off |
| 筛选 | Status multi | `needs-you`, `unread`, `working`, `done` | none = all. `unread` = persisted unread map; `done` = `idle` (already read, not running) |
| 筛选 | Archived | include archived | off (hide archived + auto-archived, same rule as today’s active view) |
| 动作 | | 全部折叠, 全部标为已读 | |

Remove the 活跃 / 归档 segmented control. Archived is only this filter.

Do not add PR, Environment, or Source.

#### Grouping

- `project`: one section per registered project path, plus 独立对话 for inbox sessions (`cwd === inboxCwd` or no project). Fork trees (`parentSessionId`) nest as today.
- `updated`: sections 今天 / 昨天 / 近 7 天 / 近 30 天 / 更早, using local calendar days on `session.updatedAt`. Fork trees flatten; children indent one step under the parent if the parent is also in the same time bucket, otherwise they appear as normal rows.
- `status`: sections 需要你 / 运行中 / 未查看 / 其他. Map `needs-you` → 需要你, `working` → 运行中, unread `done` or `error` → 未查看, `idle` and read sessions → 其他. Flatten forks the same way as `updated`.

Within a section, `ordering: updated` is newest first; `title` is `localeCompare` with `"zh"`.

#### Pinning

- Session pin: existing `pinned: string[]`. Pinned sessions appear in a 置顶 section above all groups and are not duplicated inside groups.
- Project pin: new `pinnedProjects: string[]` (absolute paths). Sentinel `"inbox"` pins 独立对话. When grouping is `project`, pinned projects (and inbox if pinned) sort above unpinned projects, still using title order among themselves. When grouping is `updated` or `status`, project pins do not move rows; the project subtitle shows a pin glyph so the preference is visible. Unpin from the project header.

Empty-message sessions (`numMessages === 0`) stay hidden, same as today.

#### Row display

Always: title (displayTitle) and a subtitle (project basename, or 独立对话).

If 显示 → 状态: existing status glyph (`working` matrix, otherwise `sess-dot`). If off: no glyph except the 置顶 section may still use a pin icon.

If 显示 → token: right-aligned compact count from `sessionTokens[id]` (integer `used`). Missing value: render nothing, do not show `0` unless a session actually recorded zero.

If 显示 → work tree: when `session.cwd` is a different directory from the project path (or inbox cwd), show `basename(session.cwd)`. If cwd equals the project root, show nothing.

#### Token cache

When the open session’s usage split gets a finite `used`, write `sessionTokens[sessionId] = used` into webui.json (debounce with the existing persist path). Never list-call `readSessionUsage` for the whole sidebar. Stale cache is acceptable until that session runs again.

### Project header menu

Add 置顶项目 / 取消置顶 beside existing add-project. Session row menu keeps 置顶 / 归档 / 删除.

## Center column

### Empty thread (`heroLayout.hero`)

Centered composer (existing `new-chat-hero`), not a doctor wall of copy. Keep CLI/auth blockers as a short line above the composer when `!grokPath` or `!authPresent`.

Composer top chips: `项目名` and `本机`. 项目名 opens a picker of registered projects + 独立对话. Choosing one sets `lastWorkspace` and the next new chat cwd. `本机` is informational (this app has no remote runtime); it is not a menu.

### Thread with messages

Composer docks to the bottom as a floating pill: attach, textarea, mode, effort, model, send. Same actions as today. Width still capped by `chatWidth`.

User turns, thinking folds, tool steps, permission cards, and run status stay; only spacing, radius, and borders change.

## Right pane

### Landing (`tab: "home"`)

2×2 tiles. Shown when `tab === "home"`. Layout-button open with no conversation-targeted tab uses `home` (see Tab model).

| Tile | Opens |
|---|---|
| 改动 | existing ChangesPanel + GitHistory |
| 文件 | existing file tree / workspace entries |
| 预览 | existing preview (empty state until a path is chosen) |
| 终端 | new terminal panel |

A header control returns to this grid without closing the pane. Close hides the pane.

Conversation-driven openings (plan, turn file, changed file, tool detail, preview path) still jump to 进度 / 文件 / 改动 / 详情 / 预览 as today. Those tabs are not tiles. User can go back to the grid, then into a tile.

### Terminal panel

Not a PTY.

1. Primary button 在终端打开项目 — `openInTerminal(cwd)`. Disabled without cwd. On non-macOS, show the existing failure string; do not pretend a terminal emulator exists.
2. List of this session’s chat items classified `bash` by `classifyTool`. Clicking one can open 详情 (existing tool detail). Empty copy: 本会话还没有终端工具输出.

### Tab model

`ReviewTab` becomes `"home" | "progress" | "files" | "changes" | "context" | "details" | "preview" | "terminal"`.

- Layout-button open with no targeted content → `home`.
- Re-open after the user left on 改动/文件/预览/终端 → restore that tab.
- `deriveReviewTabs`: `home` and `terminal` are always available when the pane is open. Counts: terminal = bash tool count; home has no count.

## Settings overlay

Full-height overlay (current `settingsOpen`), two columns:

- Left: search field 搜索设置 + icon+label nav: 总览, 外观, 对话, 扩展, 关于.
- Right: page title + grouped cards. Each row is title, muted description, control (toggle, select, button).

Search filters visible rows by title and description (client-side). No new settings backend.

扩展 is still a gateway to the extensions hub, not a second MCP switch list. 快捷键 from the account menu opens Settings on the 对话 tab and scrolls to `ShortcutsTable`.

Log out is not a settings footer action (there is no app account). CLI login remains copy on 总览.

## Persistence (`WebuiState`)

Add:

```ts
lastWorkspace?: string;
pinnedProjects?: string[];
sessionTokens?: Record<string, number>;
sidebarList?: {
  grouping: "project" | "updated" | "status";
  ordering: "updated" | "title";
  showTokens: boolean;
  showStatus: boolean;
  showWorktree: boolean;
  statusFilter: Array<"needs-you" | "unread" | "working" | "done">;
  includeArchived: boolean;
};
```

Defaults when absent: grouping `project`, ordering `updated`, `showStatus: true`, other show flags false, empty statusFilter, `includeArchived: false`, `pinnedProjects: []`, `sessionTokens: {}`.

`lastWorkspace` updates when the user opens a session, picks a composer project chip, or adds a project and uses it. Invalid paths prune on load (not in `projects` and not inbox).

Register new keys in `state-authority.ts` `DESKTOP_KEYS`.

## Error handling

- Missing token cache: omit the number.
- Missing worktree distinction: omit the label.
- `openInTerminal` throws: show the error in the terminal panel; pane stays open.
- Filter menu with zero matching sessions: empty footnote, not a crash (今天还没有会话 / 没有符合筛选的会话).
- Prune `pinned`, `pinnedProjects`, `sessionTokens`, and `unread` against live session/project ids on load (unread already prunes).

## Testing

Pure functions first (Vitest, existing style):

- `sidebar-list.ts`: grouping buckets, pin session exclusion from groups, pin project order, status/archived filters, worktree label, token omit-if-absent.
- `review-rail.ts`: home/terminal availability, layout-button vs conversation-targeted open, back-to-home.
- `state-authority.ts`: new webui keys.
- Existing `session-chrome` archived rules remain the source of “is this row archived”; list code calls them.

No snapshot tests of CSS. Manual pass after implementation: empty hero, grouped list, filter menu, pin project, toggle right pane, four tiles, settings cards, account menu, light and dark.

## Docs to update in implementation

- `design/grok-build-desktop/PRODUCT.md`: P1 IA — right pane is user-toggled with a landing grid; still not an always-on IDE. Sidebar list grouping is user-configurable; default is project.
- README capability bullets: list manager, account menu, right-pane tiles.

## File boundaries (implementation will follow)

| Unit | Responsibility |
|---|---|
| `src/lib/sidebar-list.ts` | Group, sort, filter, pin, row extras. No React. |
| `src/components/Sidebar.tsx` | Chrome, account row, list rendering. |
| `src/components/SidebarListMenu.tsx` | Filter menu + submenus. |
| `src/components/AccountMenu.tsx` | Profile popup. |
| `src/lib/review-rail.ts` | home/terminal tabs and open rules. |
| `src/components/ReviewHome.tsx` | 2×2 landing. |
| `src/components/ReviewRail.tsx` | Header back/close, tab body. |
| `src/components/Composer.tsx` | Chips + pill chrome. |
| `src/Settings.tsx` + CSS | Overlay cards and settings search. |
| `src/styles.css` | Token adjustments; no new CSS framework. |
| `src/App.tsx` | Wire prefs, lastWorkspace, tokens persist, layout button. Keep routing. |

## Rollout

Single desktop UI release. No flag. Users keep session pins; they gain project pins and list prefs at defaults above. The 活跃/归档 tabs disappear; archived sessions remain reachable via the list filter.
