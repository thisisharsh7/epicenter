/**
 * Shared browser schema for tabs and windows.
 *
 * This schema is used by all three workspaces:
 * - Background (Chrome event listeners, Chrome API sync)
 * - Popup (UI, syncs with background via chrome.runtime)
 * - Server (persistence, multi-device sync)
 *
 * The schema mirrors Chrome's Tab and Window APIs closely.
 *
 * @see https://developer.chrome.com/docs/extensions/reference/api/tabs#type-Tab
 * @see https://developer.chrome.com/docs/extensions/reference/api/windows#type-Window
 */

import {
	boolean,
	id,
	integer,
	select,
	text,
	type SerializedRow,
} from '@epicenter/hq';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Chrome window states
 * @see Browser.windows.WindowState
 * Note: 'locked-fullscreen' is ChromeOS only and requires allowlisted extensions
 */
export const WINDOW_STATES = [
	'normal',
	'minimized',
	'maximized',
	'fullscreen',
	'locked-fullscreen',
] as const;

/**
 * Chrome window types
 * @see Browser.windows.WindowType
 * Note: 'panel' and 'app' are deprecated Chrome App types
 */
export const WINDOW_TYPES = [
	'normal',
	'popup',
	'panel',
	'app',
	'devtools',
] as const;

/**
 * Chrome tab loading status
 * @see Browser.tabs.TabStatus
 */
export const TAB_STATUS = ['unloaded', 'loading', 'complete'] as const;

/**
 * Chrome tab group colors
 * @see https://developer.chrome.com/docs/extensions/reference/api/tabGroups#type-Color
 */
export const TAB_GROUP_COLORS = [
	'grey',
	'blue',
	'red',
	'yellow',
	'green',
	'pink',
	'purple',
	'cyan',
	'orange',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Table Schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tabs table - shadows browser tab state.
 *
 * The `id` field uses the browser's native tab ID (stringified). This is ephemeral
 * and changes on browser restart, but we do a destructive sync on startup anyway.
 */
export const TABS_SCHEMA = {
	id: id(), // Browser's tab.id (stringified)
	window_id: text(), // Browser's windowId (stringified)
	url: text(),
	title: text(),
	fav_icon_url: text({ nullable: true }),
	index: integer(), // Zero-based position in tab strip
	pinned: boolean({ default: false }),
	active: boolean({ default: false }),
	highlighted: boolean({ default: false }),
	muted: boolean({ default: false }),
	audible: boolean({ default: false }),
	discarded: boolean({ default: false }), // Tab unloaded to save memory
	auto_discardable: boolean({ default: true }),
	status: select({ options: TAB_STATUS, default: 'complete' }),
	group_id: text({ nullable: true }), // Chrome 88+, null on Firefox
	opener_tab_id: text({ nullable: true }), // ID of tab that opened this one
	incognito: boolean({ default: false }),
} as const;

/**
 * Windows table - shadows browser window state.
 *
 * The `id` field uses the browser's native window ID (stringified).
 */
export const WINDOWS_SCHEMA = {
	id: id(), // Browser's window.id (stringified)
	state: select({ options: WINDOW_STATES, default: 'normal' }),
	type: select({ options: WINDOW_TYPES, default: 'normal' }),
	focused: boolean({ default: false }),
	always_on_top: boolean({ default: false }),
	incognito: boolean({ default: false }),
	top: integer({ default: 0 }),
	left: integer({ default: 0 }),
	width: integer({ default: 800 }),
	height: integer({ default: 600 }),
} as const;

/**
 * Tab groups table - Chrome 88+ only, not supported on Firefox.
 *
 * @see https://developer.chrome.com/docs/extensions/reference/api/tabGroups
 */
export const TAB_GROUPS_SCHEMA = {
	id: id(), // Browser's group.id (stringified)
	window_id: text(), // Browser's windowId (stringified)
	title: text({ nullable: true }),
	color: select({ options: TAB_GROUP_COLORS, default: 'grey' }),
	collapsed: boolean({ default: false }),
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Type Exports
// ─────────────────────────────────────────────────────────────────────────────

export type Tab = SerializedRow<typeof TABS_SCHEMA>;
export type Window = SerializedRow<typeof WINDOWS_SCHEMA>;
export type TabGroup = SerializedRow<typeof TAB_GROUPS_SCHEMA>;
