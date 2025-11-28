import {
	boolean,
	defineMutation,
	defineQuery,
	defineWorkspace,
	generateId,
	id,
	integer,
	json,
	select,
	sqliteIndex,
	text,
} from '@epicenter/hq';
import { setupPersistence } from '@epicenter/hq/providers';
import { type Browser, browser as browserApi } from '@wxt-dev/browser';
import { type } from 'arktype';
import { createTaggedError, extractErrorMessage } from 'wellcrafted/error';
import { Err, Ok, tryAsync } from 'wellcrafted/result';

// ─────────────────────────────────────────────────────────────────────────────
// Error Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Error when a tab is not found in the database
 */
const { TabNotFoundErr } = createTaggedError<
	'TabNotFoundError',
	{ tabId: string }
>('TabNotFoundError');

/**
 * Error when a window is not found in the database
 */
const { WindowNotFoundErr } = createTaggedError<
	'WindowNotFoundError',
	{ windowId: string }
>('WindowNotFoundError');

/**
 * Error when a browser API call fails
 */
const { BrowserApiErr } = createTaggedError<
	'BrowserApiError',
	{ operation: string; error: string; tabId?: string; windowId?: string }
>('BrowserApiError');

/**
 * Error when the browser returns an unexpected response
 */
const { BrowserResponseErr } = createTaggedError<
	'BrowserResponseError',
	{ operation: string; details: string }
>('BrowserResponseError');

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

		// ─────────────────────────────────────────────────────────────────────────
		// Core Sync
		// ─────────────────────────────────────────────────────────────────────────

		/**
		 * Full sync from browser state to database.
		 * Clears all tables and re-populates with current browser state.
		 * Call this on extension startup to initialize the shadow database.
		 */
		syncFromBrowser: defineMutation({
			description: 'Sync all windows and tabs from browser to database',
			handler: async () => {
				// Fetch all windows with their tabs
				const { data: windows, error: fetchError } = await tryAsync({
					try: () => browserApi.windows.getAll({ populate: true }),
					catch: (e) =>
						BrowserApiErr({
							message: 'Failed to fetch windows from browser',
							context: {
								operation: 'windows.getAll',
								error: extractErrorMessage(e),
							},
						}),
				});
				if (fetchError) return Err(fetchError);

				// Batch all DB operations in a single transaction
				db.$transact(() => {
					// Clear all tables
					db.$clearAll();

					// Insert windows and tabs
					for (const win of windows) {
						if (win.id === undefined) continue;

						const windowId = generateId();
						db.windows.insert({
							id: windowId,
							browserId: win.id,
							state: win.state ?? 'normal',
							type: win.type ?? 'normal',
							focused: win.focused ?? false,
							alwaysOnTop: win.alwaysOnTop ?? false,
							incognito: win.incognito ?? false,
							bounds: {
								top: win.top ?? 0,
								left: win.left ?? 0,
								width: win.width ?? 800,
								height: win.height ?? 600,
							},
						});

						// Insert tabs for this window
						for (const tab of win.tabs ?? []) {
							if (tab.id === undefined) continue;

							db.tabs.insert({
								id: generateId(),
								browserId: tab.id,
								windowId,
								url: tab.url ?? '',
								title: tab.title ?? '',
								favIconUrl: tab.favIconUrl ?? null,
								index: tab.index ?? 0,
								pinned: tab.pinned ?? false,
								active: tab.active ?? false,
								highlighted: tab.highlighted ?? false,
								muted: tab.mutedInfo?.muted ?? false,
								audible: tab.audible ?? false,
								discarded: tab.discarded ?? false,
								autoDiscardable: tab.autoDiscardable ?? true,
								status: tab.status ?? 'complete',
								groupId: null, // Skip tab groups for now
								openerTabId: null, // Would need separate mapping
								incognito: tab.incognito ?? false,
							});
						}
					}
				});

				return Ok({ windowCount: windows.length });
			},
		}),

		// ─────────────────────────────────────────────────────────────────────────
		// Tab Actions (Double-Write)
		// ─────────────────────────────────────────────────────────────────────────

		/**
		 * Close a tab
		 */
		closeTab: defineMutation({
			input: type({ tabId: 'string' }),
			description: 'Close a tab by its stable ID',
			handler: async ({ tabId }) => {
				const result = db.tabs.get({ id: tabId });
				if (!result?.data) {
					return TabNotFoundErr({
						message: 'Tab not found',
						context: { tabId },
					});
				}
				const tab = result.data;

				const { error } = await tryAsync({
					try: () => browserApi.tabs.remove(tab.browserId),
					catch: (e) =>
						BrowserApiErr({
							message: 'Failed to close tab',
							context: {
								operation: 'tabs.remove',
								tabId,
								error: extractErrorMessage(e),
							},
						}),
				});
				if (error) return Err(error);

				db.tabs.delete({ id: tabId });
				return Ok(undefined);
			},
		}),

		/**
		 * Create a new tab
		 */
		createTab: defineMutation({
			input: type({
				windowId: 'string | undefined',
				url: 'string | undefined',
				active: 'boolean | undefined',
				index: 'number | undefined',
			}),
			description: 'Create a new tab',
			handler: async ({ windowId, url, active, index }) => {
				// Look up browser window ID if provided
				let browserWindowId: number | undefined;
				if (windowId) {
					const winResult = db.windows.get({ id: windowId });
					if (!winResult?.data) {
						return WindowNotFoundErr({
							message: 'Window not found',
							context: { windowId },
						});
					}
					browserWindowId = winResult.data.browserId;
				}

				const { data: newTab, error } = await tryAsync({
					try: () =>
						browserApi.tabs.create({
							windowId: browserWindowId,
							url,
							active,
							index,
						}),
					catch: (e) =>
						BrowserApiErr({
							message: 'Failed to create tab',
							context: {
								operation: 'tabs.create',
								windowId,
								error: extractErrorMessage(e),
							},
						}),
				});
				if (error) return Err(error);
				if (newTab.id === undefined) {
					return BrowserResponseErr({
						message: 'Browser did not return tab ID',
						context: {
							operation: 'tabs.create',
							details: 'Tab ID is undefined',
						},
					});
				}

				// Need to find which window the tab ended up in
				const targetWindowId =
					windowId ??
					db.windows.getAll().find((w) => w.browserId === newTab.windowId)?.id;

				if (!targetWindowId) {
					return BrowserResponseErr({
						message: 'Could not determine window for new tab',
						context: {
							operation: 'tabs.create',
							details: 'Window lookup failed',
						},
					});
				}

				const tabId = generateId();
				db.tabs.insert({
					id: tabId,
					browserId: newTab.id,
					windowId: targetWindowId,
					url: newTab.url ?? '',
					title: newTab.title ?? '',
					favIconUrl: newTab.favIconUrl ?? null,
					index: newTab.index ?? 0,
					pinned: newTab.pinned ?? false,
					active: newTab.active ?? false,
					highlighted: newTab.highlighted ?? false,
					muted: newTab.mutedInfo?.muted ?? false,
					audible: newTab.audible ?? false,
					discarded: newTab.discarded ?? false,
					autoDiscardable: newTab.autoDiscardable ?? true,
					status: newTab.status ?? 'complete',
					groupId: null,
					openerTabId: null,
					incognito: newTab.incognito ?? false,
				});

				return Ok({ tabId });
			},
		}),

		/**
		 * Move a tab to a different position or window
		 */
		moveTab: defineMutation({
			input: type({
				tabId: 'string',
				windowId: 'string | undefined',
				index: 'number',
			}),
			description: 'Move a tab to a different position or window',
			handler: async ({ tabId, windowId, index }) => {
				const tabResult = db.tabs.get({ id: tabId });
				if (!tabResult?.data) {
					return TabNotFoundErr({
						message: 'Tab not found',
						context: { tabId },
					});
				}
				const tab = tabResult.data;

				// Look up browser window ID if provided
				let browserWindowId: number | undefined;
				if (windowId) {
					const winResult = db.windows.get({ id: windowId });
					if (!winResult?.data) {
						return WindowNotFoundErr({
							message: 'Window not found',
							context: { windowId },
						});
					}
					browserWindowId = winResult.data.browserId;
				}

				const { data: movedTab, error } = await tryAsync({
					try: () =>
						browserApi.tabs.move(tab.browserId, {
							windowId: browserWindowId,
							index,
						}),
					catch: (e) =>
						BrowserApiErr({
							message: 'Failed to move tab',
							context: {
								operation: 'tabs.move',
								tabId,
								error: extractErrorMessage(e),
							},
						}),
				});
				if (error) return Err(error);

				// Update in database
				const moved = Array.isArray(movedTab) ? movedTab[0] : movedTab;
				const targetWindowId =
					windowId ??
					db.windows.getAll().find((w) => w.browserId === moved?.windowId)
						?.id ??
					tab.windowId;

				db.tabs.update({
					id: tabId,
					windowId: targetWindowId,
					index: moved?.index ?? index,
				});

				return Ok(undefined);
			},
		}),

		/**
		 * Pin a tab
		 */
		pinTab: defineMutation({
			input: type({ tabId: 'string' }),
			description: 'Pin a tab',
			handler: async ({ tabId }) => {
				const result = db.tabs.get({ id: tabId });
				if (!result?.data) {
					return TabNotFoundErr({
						message: 'Tab not found',
						context: { tabId },
					});
				}
				const tab = result.data;

				const { error } = await tryAsync({
					try: () => browserApi.tabs.update(tab.browserId, { pinned: true }),
					catch: (e) =>
						BrowserApiErr({
							message: 'Failed to pin tab',
							context: {
								operation: 'tabs.update',
								tabId,
								error: extractErrorMessage(e),
							},
						}),
				});
				if (error) return Err(error);

				db.tabs.update({ id: tabId, pinned: true });
				return Ok(undefined);
			},
		}),

		/**
		 * Unpin a tab
		 */
		unpinTab: defineMutation({
			input: type({ tabId: 'string' }),
			description: 'Unpin a tab',
			handler: async ({ tabId }) => {
				const result = db.tabs.get({ id: tabId });
				if (!result?.data) {
					return TabNotFoundErr({
						message: 'Tab not found',
						context: { tabId },
					});
				}
				const tab = result.data;

				const { error } = await tryAsync({
					try: () => browserApi.tabs.update(tab.browserId, { pinned: false }),
					catch: (e) =>
						BrowserApiErr({
							message: 'Failed to unpin tab',
							context: {
								operation: 'tabs.update',
								tabId,
								error: extractErrorMessage(e),
							},
						}),
				});
				if (error) return Err(error);

				db.tabs.update({ id: tabId, pinned: false });
				return Ok(undefined);
			},
		}),

		/**
		 * Mute a tab
		 */
		muteTab: defineMutation({
			input: type({ tabId: 'string' }),
			description: 'Mute a tab',
			handler: async ({ tabId }) => {
				const result = db.tabs.get({ id: tabId });
				if (!result?.data) {
					return TabNotFoundErr({
						message: 'Tab not found',
						context: { tabId },
					});
				}
				const tab = result.data;

				const { error } = await tryAsync({
					try: () => browserApi.tabs.update(tab.browserId, { muted: true }),
					catch: (e) =>
						BrowserApiErr({
							message: 'Failed to mute tab',
							context: {
								operation: 'tabs.update',
								tabId,
								error: extractErrorMessage(e),
							},
						}),
				});
				if (error) return Err(error);

				db.tabs.update({ id: tabId, muted: true });
				return Ok(undefined);
			},
		}),

		/**
		 * Unmute a tab
		 */
		unmuteTab: defineMutation({
			input: type({ tabId: 'string' }),
			description: 'Unmute a tab',
			handler: async ({ tabId }) => {
				const result = db.tabs.get({ id: tabId });
				if (!result?.data) {
					return TabNotFoundErr({
						message: 'Tab not found',
						context: { tabId },
					});
				}
				const tab = result.data;

				const { error } = await tryAsync({
					try: () => browserApi.tabs.update(tab.browserId, { muted: false }),
					catch: (e) =>
						BrowserApiErr({
							message: 'Failed to unmute tab',
							context: {
								operation: 'tabs.update',
								tabId,
								error: extractErrorMessage(e),
							},
						}),
				});
				if (error) return Err(error);

				db.tabs.update({ id: tabId, muted: false });
				return Ok(undefined);
			},
		}),

		/**
		 * Reload a tab
		 */
		reloadTab: defineMutation({
			input: type({ tabId: 'string' }),
			description: 'Reload a tab',
			handler: async ({ tabId }) => {
				const result = db.tabs.get({ id: tabId });
				if (!result?.data) {
					return TabNotFoundErr({
						message: 'Tab not found',
						context: { tabId },
					});
				}
				const tab = result.data;

				const { error } = await tryAsync({
					try: () => browserApi.tabs.reload(tab.browserId),
					catch: (e) =>
						BrowserApiErr({
							message: 'Failed to reload tab',
							context: {
								operation: 'tabs.reload',
								tabId,
								error: extractErrorMessage(e),
							},
						}),
				});
				if (error) return Err(error);

				db.tabs.update({ id: tabId, status: 'loading' });
				return Ok(undefined);
			},
		}),

		/**
		 * Duplicate a tab
		 */
		duplicateTab: defineMutation({
			input: type({ tabId: 'string' }),
			description: 'Duplicate a tab',
			handler: async ({ tabId }) => {
				const result = db.tabs.get({ id: tabId });
				if (!result?.data) {
					return TabNotFoundErr({
						message: 'Tab not found',
						context: { tabId },
					});
				}
				const tab = result.data;

				const { data: newTab, error } = await tryAsync({
					try: () => browserApi.tabs.duplicate(tab.browserId),
					catch: (e) =>
						BrowserApiErr({
							message: 'Failed to duplicate tab',
							context: {
								operation: 'tabs.duplicate',
								tabId,
								error: extractErrorMessage(e),
							},
						}),
				});
				if (error) return Err(error);
				if (!newTab || newTab.id === undefined) {
					return BrowserResponseErr({
						message: 'Browser did not return duplicated tab',
						context: {
							operation: 'tabs.duplicate',
							details: 'Tab ID is undefined',
						},
					});
				}

				const newTabId = generateId();

				db.tabs.insert({
					id: newTabId,
					browserId: newTab.id,
					windowId: tab.windowId,
					url: newTab.url ?? tab.url,
					title: newTab.title ?? tab.title,
					favIconUrl: newTab.favIconUrl ?? tab.favIconUrl,
					index: newTab.index ?? tab.index + 1,
					pinned: newTab.pinned ?? false,
					active: newTab.active ?? false,
					highlighted: newTab.highlighted ?? false,
					muted: newTab.mutedInfo?.muted ?? false,
					audible: newTab.audible ?? false,
					discarded: newTab.discarded ?? false,
					autoDiscardable: newTab.autoDiscardable ?? true,
					status: newTab.status ?? 'complete',
					groupId: null,
					openerTabId: tabId, // The original tab opened this one
					incognito: newTab.incognito ?? false,
				});

				return Ok({ tabId: newTabId });
			},
		}),

		// ─────────────────────────────────────────────────────────────────────────
		// Window Actions (Double-Write)
		// ─────────────────────────────────────────────────────────────────────────

		/**
		 * Close a window (and all its tabs)
		 */
		closeWindow: defineMutation({
			input: type({ windowId: 'string' }),
			description: 'Close a window and all its tabs',
			handler: async ({ windowId }) => {
				const winResult = db.windows.get({ id: windowId });
				if (!winResult?.data) {
					return WindowNotFoundErr({
						message: 'Window not found',
						context: { windowId },
					});
				}
				const win = winResult.data;

				const { error } = await tryAsync({
					try: () => browserApi.windows.remove(win.browserId),
					catch: (e) =>
						BrowserApiErr({
							message: 'Failed to close window',
							context: {
								operation: 'windows.remove',
								windowId,
								error: extractErrorMessage(e),
							},
						}),
				});
				if (error) return Err(error);

				// Batch deletions in a single transaction
				db.$transact(() => {
					// Delete all tabs in this window
					const tabsInWindow = db.tabs
						.getAll()
						.filter((t) => t.windowId === windowId);
					db.tabs.deleteMany({ ids: tabsInWindow.map((t) => t.id) });

					// Delete the window
					db.windows.delete({ id: windowId });
				});

				return Ok(undefined);
			},
		}),

		// ─────────────────────────────────────────────────────────────────────────
		// Query Actions
		// ─────────────────────────────────────────────────────────────────────────

		/**
		 * Get all tabs from the database
		 */
		getAllTabs: defineQuery({
			description: 'Get all tabs from the database',
			handler: () => db.tabs.getAll().map((t) => t.toJSON()),
		}),

		/**
		 * Get all windows from the database
		 */
		getAllWindows: defineQuery({
			description: 'Get all windows from the database',
			handler: () => db.windows.getAll().map((w) => w.toJSON()),
		}),
	}),
});
