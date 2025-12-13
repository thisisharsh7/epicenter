/**
 * Browser workspace for content-hub server.
 *
 * This workspace syncs with the tab-manager browser extension.
 * The schema MUST match apps/tab-manager/src/lib/epicenter/browser.schema.ts exactly.
 *
 * Architecture:
 * - Browser extension (tab-manager): Y.Doc in background service worker
 * - Server (content-hub): Y.Doc in this workspace
 * - WebSocket: Bidirectional sync via y-websocket protocol at /sync/browser
 *
 * Data flow:
 * 1. Extension: Chrome events → Y.Doc → WebSocket → Server
 * 2. Server: Script → Y.Doc → WebSocket → Extension → Chrome APIs
 */

import {
	boolean,
	defineMutation,
	defineQuery,
	defineWorkspace,
	id,
	integer,
	select,
	text,
} from '@epicenter/hq';
import {
	markdownProvider,
	withTitleFilename,
} from '@epicenter/hq/providers/markdown';
import { setupPersistence } from '@epicenter/hq/providers/persistence';
import { sqliteProvider } from '@epicenter/hq/providers/sqlite';
import { type } from 'arktype';

// ─────────────────────────────────────────────────────────────────────────────
// Constants (MUST match tab-manager/src/lib/epicenter/browser.schema.ts)
// ─────────────────────────────────────────────────────────────────────────────

const WINDOW_STATES = [
	'normal',
	'minimized',
	'maximized',
	'fullscreen',
	'locked-fullscreen',
] as const;

const WINDOW_TYPES = ['normal', 'popup', 'panel'] as const;

const TAB_STATUS = ['unloaded', 'loading', 'complete'] as const;

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
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Table Schemas (MUST match tab-manager/src/lib/epicenter/browser.schema.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tabs table - shadows browser tab state.
 *
 * The `id` field uses the browser's native tab ID (stringified). This is ephemeral
 * and changes on browser restart, but we do a destructive sync on startup anyway.
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

/**
 * Tab groups table - Chrome 88+ only, not supported on Firefox.
 */
const TAB_GROUPS_SCHEMA = {
	id: id(), // Browser's group.id (stringified)
	window_id: text(), // Browser's windowId (stringified)
	title: text({ nullable: true }),
	color: select({ options: TAB_GROUP_COLORS, default: 'grey' }),
	collapsed: boolean({ default: false }),
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Workspace Definition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Browser workspace - server-side shadow of browser tab state.
 *
 * This workspace receives tab/window data via WebSocket sync from the
 * tab-manager browser extension. It can also push changes back to the
 * extension, which will be applied to the actual browser.
 *
 * Note: This workspace does NOT have direct Chrome API access. It relies
 * entirely on the extension for Chrome interactions.
 */
export const browser = defineWorkspace({
	id: 'browser',

	tables: {
		tabs: TABS_SCHEMA,
		windows: WINDOWS_SCHEMA,
		tab_groups: TAB_GROUPS_SCHEMA,
	},

	providers: {
		persistence: (c) => setupPersistence(c),
		sqlite: (c) => sqliteProvider(c),
		// Markdown provider with human-readable filenames:
		// - Tabs: "{title}-{id}.md" (e.g., "GitHub - Pull Requests-abc123.md")
		// - Windows/TabGroups: "{id}.md" (default)
		markdown: (c) =>
			markdownProvider(c, {
				tableConfigs: {
					tabs: withTitleFilename('title'),
				},
			}),
	},

	exports: ({ tables, providers }) => ({
		// Expose table operations directly for scripting
		...tables,

		// SQLite provider operations
		pullToSqlite: providers.sqlite.pullToSqlite,
		pushFromSqlite: providers.sqlite.pushFromSqlite,

		// Markdown provider operations
		pullToMarkdown: providers.markdown.pullToMarkdown,
		pushFromMarkdown: providers.markdown.pushFromMarkdown,

		// ─────────────────────────────────────────────────────────────────────────
		// Query Actions
		// ─────────────────────────────────────────────────────────────────────────

		/**
		 * Get all tabs from the database
		 */
		getAllTabs: defineQuery({
			description: 'Get all tabs from the database',
			handler: () =>
				tables.tabs
					.getAllValid()
					.sort((a, b) => a.index - b.index)
					.map((t) => t.toJSON()),
		}),

		/**
		 * Get all windows from the database
		 */
		getAllWindows: defineQuery({
			description: 'Get all windows from the database',
			handler: () => tables.windows.getAllValid().map((w) => w.toJSON()),
		}),

		/**
		 * Get all tab groups from the database
		 */
		getAllTabGroups: defineQuery({
			description: 'Get all tab groups from the database',
			handler: () => tables.tab_groups.getAllValid().map((g) => g.toJSON()),
		}),

		/**
		 * Get tabs for a specific window
		 */
		getTabsByWindow: defineQuery({
			input: type({ window_id: 'string' }),
			description: 'Get tabs for a specific window',
			handler: ({ window_id }) =>
				tables.tabs
					.filter((t) => t.window_id === window_id)
					.sort((a, b) => a.index - b.index)
					.map((t) => t.toJSON()),
		}),

		/**
		 * Search tabs by URL or title
		 */
		searchTabs: defineQuery({
			input: type({ query: 'string' }),
			description: 'Search tabs by URL or title',
			handler: ({ query }) => {
				const lowerQuery = query.toLowerCase();
				return tables.tabs
					.filter(
						(t) =>
							t.url.toLowerCase().includes(lowerQuery) ||
							t.title.toLowerCase().includes(lowerQuery),
					)
					.sort((a, b) => a.index - b.index)
					.map((t) => t.toJSON());
			},
		}),

		// ─────────────────────────────────────────────────────────────────────────
		// Mutation Actions (these update Y.Doc, which syncs to extension)
		// ─────────────────────────────────────────────────────────────────────────

		/**
		 * Delete a tab from the Y.Doc.
		 *
		 * When synced to the browser extension, the extension will:
		 * 1. Receive the Y.Doc update
		 * 2. Detect the deletion
		 * 3. Call chrome.tabs.remove() to actually close the tab
		 *
		 * Note: The extension currently does NOT listen for Y.Doc deletions
		 * to trigger Chrome API calls. This is a one-way sync (Chrome → Y.Doc).
		 * To close a tab from the server, you need to implement a listener
		 * in the extension that watches for Y.Doc deletions.
		 */
		deleteTab: defineMutation({
			input: type({ tab_id: 'string' }),
			description:
				'Delete a tab from the Y.Doc (syncs to extension, but extension must handle Chrome API call)',
			handler: ({ tab_id }) => {
				const existing = tables.tabs.get({ id: tab_id });
				if (existing.status !== 'valid') {
					return { success: false, error: 'Tab not found' };
				}
				tables.tabs.delete({ id: tab_id });
				return { success: true, deletedId: tab_id };
			},
		}),

		/**
		 * Delete multiple tabs
		 */
		deleteTabs: defineMutation({
			input: type({ tab_ids: 'string[]' }),
			description: 'Delete multiple tabs from the Y.Doc',
			handler: ({ tab_ids }) => {
				const deleted: string[] = [];
				const notFound: string[] = [];

				tables.$transact(() => {
					for (const tab_id of tab_ids) {
						const existing = tables.tabs.get({ id: tab_id });
						if (existing.status === 'valid') {
							tables.tabs.delete({ id: tab_id });
							deleted.push(tab_id);
						} else {
							notFound.push(tab_id);
						}
					}
				});

				return { deleted, notFound };
			},
		}),

		/**
		 * Delete all tabs matching a URL pattern
		 */
		deleteTabsByUrlPattern: defineMutation({
			input: type({ pattern: 'string' }),
			description: 'Delete all tabs matching a URL pattern (substring match)',
			handler: ({ pattern }) => {
				const lowerPattern = pattern.toLowerCase();
				const matching = tables.tabs.filter((t) =>
					t.url.toLowerCase().includes(lowerPattern),
				);

				const deleted: string[] = [];
				tables.$transact(() => {
					for (const tab of matching) {
						tables.tabs.delete({ id: tab.id });
						deleted.push(tab.id);
					}
				});

				return { deleted, count: deleted.length };
			},
		}),

		/**
		 * Clear all tabs, windows, and tab groups.
		 * Use with caution - this will sync to the extension!
		 */
		clearAll: defineMutation({
			description: 'Clear all tabs, windows, and tab groups from the Y.Doc',
			handler: () => {
				tables.$transact(() => {
					tables.$clearAll();
				});
				return { success: true };
			},
		}),
	}),
});
