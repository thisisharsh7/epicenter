import {
	boolean,
	defineWorkspace,
	id,
	integer,
	type SerializedRow,
	select,
	text,
} from '@epicenter/hq';

// ─────────────────────────────────────────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * String literal types derived from Browser enums using template literal pattern.
 * This avoids TypeScript enum weirdness while keeping @wxt-dev/browser as source of truth.
 */
type WindowState = `${Browser.windows.WindowState}`;
type WindowType = `${Browser.windows.WindowType}`;
type TabStatus = `${Browser.tabs.TabStatus}`;

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Chrome window states
 * @see Browser.windows.WindowState
 * Note: 'locked-fullscreen' is ChromeOS only and requires allowlisted extensions
 */
const WINDOW_STATES = [
	'normal',
	'minimized',
	'maximized',
	'fullscreen',
	'locked-fullscreen',
] as const satisfies readonly WindowState[];

/**
 * Chrome window types
 * @see Browser.windows.WindowType
 * Note: 'panel' and 'app' are deprecated Chrome App types
 */
const WINDOW_TYPES = [
	'normal',
	'popup',
	'panel',
	'app',
	'devtools',
] as const satisfies readonly WindowType[];

/**
 * Chrome tab loading status
 * @see Browser.tabs.TabStatus
 */
const TAB_STATUS = [
	'unloaded',
	'loading',
	'complete',
] as const satisfies readonly TabStatus[];

// ─────────────────────────────────────────────────────────────────────────────
// Table Schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tabs table - shadows browser tab state.
 *
 * The `id` field uses the browser's native tab ID (stringified). This is ephemeral
 * and changes on browser restart, but we do a destructive sync on startup anyway.
 *
 * @see https://developer.chrome.com/docs/extensions/reference/api/tabs#type-Tab
 */
const TABS_SCHEMA = {
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
 *
 * @see https://developer.chrome.com/docs/extensions/reference/api/windows#type-Window
 */
const WINDOWS_SCHEMA = {
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

// ─────────────────────────────────────────────────────────────────────────────
// Workspace Definition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Browser workspace - schema for syncing browser tabs/windows via YJS.
 *
 * This workspace is used by:
 * 1. Browser extension background script (has Chrome/Firefox API access)
 * 2. Desktop server (syncs to markdown files)
 *
 * The background script handles all browser API interactions and event handling.
 * This file is purely the schema definition - no browser API dependencies.
 *
 * ## ID Strategy
 *
 * Uses browser's native IDs directly (stringified) instead of generating stable IDs.
 * On browser restart, all IDs change and we do a destructive sync (clear and rebuild).
 * This keeps the mapping simple: tab.id in YJS === tab.id in Chrome API.
 *
 * ## Hard Deletes
 *
 * When tabs/windows are closed, rows are fully deleted (not soft-deleted).
 */
export const browser = defineWorkspace({
	id: 'browser',

	tables: {
		tabs: TABS_SCHEMA,
		windows: WINDOWS_SCHEMA,
	},

	providers: {},

	exports: ({ tables }) => ({
		// Expose table operations directly for use by background script and server
		...tables,
	}),
});

// ─────────────────────────────────────────────────────────────────────────────
// Type Exports
// ─────────────────────────────────────────────────────────────────────────────

export type Tab = SerializedRow<typeof TABS_SCHEMA>;
export type Window = SerializedRow<typeof WINDOWS_SCHEMA>;
