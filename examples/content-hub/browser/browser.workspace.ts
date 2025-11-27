import {
	boolean,
	defineWorkspace,
	id,
	integer,
	json,
	select,
	sqliteIndex,
	text,
} from '@epicenter/hq';
import { setupPersistence } from '@epicenter/hq/providers';
import type { Browser } from '@wxt-dev/browser';
import { type } from 'arktype';

/**
 * String literal types derived from Browser enums using template literal pattern.
 * This avoids TypeScript enum weirdness while keeping @wxt-dev/browser as source of truth.
 */
type WindowState = `${Browser.windows.WindowState}`;
type WindowType = `${Browser.windows.WindowType}`;
type TabStatus = `${Browser.tabs.TabStatus}`;
type TabGroupColor = `${Browser.tabGroups.Color}`;

// ─────────────────────────────────────────────────────────────────────────────
// Constants (derived from Browser types)
// These arrays match the union types from @wxt-dev/browser
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

/**
 * Chrome tab group colors (9 options)
 * @see Browser.tabGroups.Color
 */
const TAB_GROUP_COLORS = [
	'grey',
	'blue',
	'red',
	'yellow',
	'green',
	'pink',
	'purple',
	'cyan',
	'orange',
] as const satisfies readonly TabGroupColor[];

// ─────────────────────────────────────────────────────────────────────────────
// Bounds schema for window position/size (used in json column)
// ─────────────────────────────────────────────────────────────────────────────

const BoundsSchema = type({
	top: 'number',
	left: 'number',
	width: 'number',
	height: 'number',
});

// ─────────────────────────────────────────────────────────────────────────────
// Table Schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tabs table - shadows browser tab state
 *
 * Each row represents a browser tab. The `browserId` is ephemeral (changes on
 * browser restart), while `id` is stable across sessions.
 *
 * @see https://developer.chrome.com/docs/extensions/reference/api/tabs#type-Tab
 */
const TABS_SCHEMA = {
	id: id(),
	browserId: integer(), // Browser's ephemeral numeric ID
	windowId: text(), // FK to windows table
	url: text(),
	title: text(),
	favIconUrl: text({ nullable: true }),
	index: integer(), // Zero-based position in tab strip
	pinned: boolean({ default: false }),
	active: boolean({ default: false }),
	highlighted: boolean({ default: false }),
	muted: boolean({ default: false }),
	audible: boolean({ default: false }),
	discarded: boolean({ default: false }), // Tab unloaded to save memory
	autoDiscardable: boolean({ default: true }),
	status: select({ options: TAB_STATUS, default: 'complete' }),
	groupId: text({ nullable: true }), // FK to tabGroups (Chrome 88+, null on Firefox)
	openerTabId: text({ nullable: true }), // ID of tab that opened this one
	incognito: boolean({ default: false }),
} as const;

/**
 * Windows table - shadows browser window state
 */
const WINDOWS_SCHEMA = {
	id: id(),
	browserId: integer(), // Browser's ephemeral numeric ID
	state: select({ options: WINDOW_STATES, default: 'normal' }),
	type: select({ options: WINDOW_TYPES, default: 'normal' }),
	focused: boolean({ default: false }),
	alwaysOnTop: boolean({ default: false }),
	incognito: boolean({ default: false }),
	bounds: json({ schema: BoundsSchema }),
} as const;

/**
 * Tab Groups table - shadows Chrome tab group state (no-op on Firefox)
 */
const TAB_GROUPS_SCHEMA = {
	id: id(),
	browserId: integer(), // Browser's ephemeral numeric ID
	windowId: text(), // FK to windows table
	title: text({ default: '' }),
	color: select({ options: TAB_GROUP_COLORS, default: 'grey' }),
	collapsed: boolean({ default: false }),
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Workspace Definition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Browser workspace
 *
 * Manages browser tab/window state as a synchronized shadow database.
 * This workspace is designed to run in two contexts:
 *
 * 1. **Browser runtime** (extension): Has access to Chrome/Firefox APIs.
 *    Actions directly manipulate browser state AND update this schema.
 *
 * 2. **Node runtime** (CLI/desktop): No browser API access.
 *    Actions send messages to the browser runtime via stdio/Native Messaging.
 *
 * The Yjs document automatically syncs between both runtimes, keeping the
 * shadow database consistent regardless of where changes originate.
 *
 * ## Double-Write Pattern
 *
 * In the browser runtime, every action that modifies browser state also
 * updates this schema. For example, `closeTab` will:
 * 1. Call `chrome.tabs.remove(browserId)`
 * 2. Call `db.tabs.delete(tabId)`
 *
 * This keeps the schema synchronized with actual browser state.
 *
 * ## Hard Deletes
 *
 * When tabs/windows/groups are closed, rows are fully deleted (not soft-deleted).
 */
export const browser = defineWorkspace({
	id: 'browser',

	schema: {
		tabs: TABS_SCHEMA,
		windows: WINDOWS_SCHEMA,
		tabGroups: TAB_GROUPS_SCHEMA,
	},

	indexes: {
		sqlite: (c) => sqliteIndex(c),
	},

	providers: [setupPersistence],

	exports: ({ db, indexes }) => ({
		// Expose table operations directly
		...db,

		// SQLite index operations
		pullToSqlite: indexes.sqlite.pullToSqlite,
		pushFromSqlite: indexes.sqlite.pushFromSqlite,
	}),
});
