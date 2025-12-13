/**
 * Background workspace definition.
 *
 * Used in the background service worker context. This is the authoritative
 * Y.Doc holder that:
 * - Persists to IndexedDB
 * - Syncs Chrome tabs/windows state to Y.Doc
 * - Syncs with server via WebSocket
 *
 * Note: The popup reads directly from Chrome APIs - no Y.Doc sync to popup needed.
 */

import { defineProviderExports, defineWorkspace } from '@epicenter/hq';
import { createWebsocketSyncProvider } from '@epicenter/hq/providers/websocket-sync';
import { IndexeddbPersistence } from 'y-indexeddb';
import {
	chromeTabToRow,
	chromeWindowToRow,
	chromeTabGroupToRow,
} from '$lib/chrome-helpers';
import { type Tab, type Window } from './browser.schema';
import { BROWSER_SCHEMA } from './schema';

// ─────────────────────────────────────────────────────────────────────────────
// Workspace Definition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Background workspace - the authoritative Y.Doc holder.
 *
 * Providers:
 * - `persistence`: IndexedDB persistence via y-indexeddb
 * - `serverSync`: WebSocket sync with Elysia server
 * - `chromeSync`: Chrome event listeners that update Y.Doc, exports `syncAllFromChrome`
 */
export const backgroundWorkspace = defineWorkspace({
	id: 'browser',
	tables: BROWSER_SCHEMA,
	providers: {
		/**
		 * IndexedDB persistence provider.
		 *
		 * Automatically loads/saves Y.Doc state to IndexedDB.
		 * Exports `whenSynced` promise for lifecycle coordination.
		 */
		persistence: ({ ydoc }) => {
			const persistence = new IndexeddbPersistence('tab-manager', ydoc);

			persistence.on('synced', () => {
				console.log('[Background] IndexedDB synced');
			});

			return defineProviderExports({
				whenSynced: persistence.whenSynced,
				destroy() {
					persistence.destroy();
				},
			});
		},

		/**
		 * WebSocket sync provider for server connection.
		 *
		 * Connects to the Elysia server for multi-device sync.
		 * Falls back gracefully if server is not available.
		 */
		serverSync: createWebsocketSyncProvider({
			url: 'ws://localhost:3913/sync',
		}),

		/**
		 * Chrome sync provider.
		 *
		 * Sets up Chrome event listeners that sync Chrome state → Y.Doc.
		 * Exports `syncAllFromChrome` for initial/full sync.
		 */
		chromeSync: ({ tables }) => {
			// ═══════════════════════════════════════════════════════════════════════════
			// INITIAL SYNC - Merge strategy (preserves server data)
			// ═══════════════════════════════════════════════════════════════════════════

			async function syncAllFromChrome() {
				console.log('[Background] Starting merge sync from Chrome...');

				// Get all windows and tabs from Chrome
				const [chromeTabs, chromeWindows] = await Promise.all([
					browser.tabs.query({}),
					browser.windows.getAll(),
				]);

				// Build sets of Chrome IDs for fast lookup
				const chromeWindowIds = new Set(
					chromeWindows.filter((w) => w.id !== undefined).map((w) => String(w.id)),
				);
				const chromeTabIds = new Set(
					chromeTabs.filter((t) => t.id !== undefined).map((t) => String(t.id)),
				);

				tables.$transact(() => {
					// Sync windows first (tabs reference windows)
					for (const win of chromeWindows) {
						if (win.id === undefined) continue;
						tables.windows.upsert(chromeWindowToRow(win));
					}

					// Remove windows not in Chrome (closed while offline)
					for (const existing of tables.windows.getAllValid()) {
						if (!chromeWindowIds.has(existing.id)) {
							tables.windows.delete({ id: existing.id });
						}
					}

					// Sync tabs
					for (const tab of chromeTabs) {
						if (tab.id === undefined) continue;
						tables.tabs.upsert(chromeTabToRow(tab));
					}

					// Remove tabs not in Chrome (closed while offline)
					for (const existing of tables.tabs.getAllValid()) {
						if (!chromeTabIds.has(existing.id)) {
							tables.tabs.delete({ id: existing.id });
						}
					}
				});

				// Sync tab groups (Chrome 88+ only)
				if (browser.tabGroups) {
					const chromeGroups = await browser.tabGroups.query({});
					const chromeGroupIds = new Set(chromeGroups.map((g) => String(g.id)));

					tables.$transact(() => {
						for (const group of chromeGroups) {
							tables.tab_groups.upsert(chromeTabGroupToRow(group));
						}

						// Remove groups not in Chrome
						for (const existing of tables.tab_groups.getAllValid()) {
							if (!chromeGroupIds.has(existing.id)) {
								tables.tab_groups.delete({ id: existing.id });
							}
						}
					});
				}

				console.log('[Background] Synced from Chrome:', {
					tabs: tables.tabs.getAllValid().length,
					windows: tables.windows.getAllValid().length,
					tabGroups: tables.tab_groups.getAllValid().length,
				});
			}

			// ═══════════════════════════════════════════════════════════════════════════
			// CHROME EVENT LISTENERS - Chrome → Y.Doc
			// ═══════════════════════════════════════════════════════════════════════════

			// --- Tab Events ---

			browser.tabs.onCreated.addListener((tab) => {
				if (tab.id === undefined) return;
				tables.tabs.upsert(chromeTabToRow(tab));
			});

			browser.tabs.onRemoved.addListener((tabId) => {
				tables.tabs.delete({ id: String(tabId) });
			});

			browser.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) => {
				if (tab.id === undefined) return;
				// upsert handles both create and update
				tables.tabs.upsert(chromeTabToRow(tab));
			});

			browser.tabs.onActivated.addListener(({ tabId, windowId }) => {
				tables.$transact(() => {
					// Deactivate all tabs in the window
					const windowTabs = tables.tabs.filter(
						(t) =>
							t.window_id === String(windowId) &&
							t.active &&
							t.id !== String(tabId),
					);
					for (const tab of windowTabs) {
						tables.tabs.update({ id: tab.id, active: false });
					}
					// Activate the new tab
					tables.tabs.update({ id: String(tabId), active: true });
				});
			});

			browser.tabs.onMoved.addListener(
				(tabId, { windowId, fromIndex, toIndex }) => {
					tables.$transact(() => {
						// Get all tabs in the window sorted by index
						const windowTabs = tables.tabs
							.filter((t) => t.window_id === String(windowId))
							.sort((a, b) => a.index - b.index);

						// Update indices
						for (const tab of windowTabs) {
							if (tab.id === String(tabId)) {
								tables.tabs.update({ id: tab.id, index: toIndex });
							} else if (fromIndex < toIndex) {
								// Moving right: decrement tabs in between
								if (tab.index > fromIndex && tab.index <= toIndex) {
									tables.tabs.update({ id: tab.id, index: tab.index - 1 });
								}
							} else {
								// Moving left: increment tabs in between
								if (tab.index >= toIndex && tab.index < fromIndex) {
									tables.tabs.update({ id: tab.id, index: tab.index + 1 });
								}
							}
						}
					});
				},
			);

			browser.tabs.onAttached.addListener(
				(tabId, { newWindowId, newPosition }) => {
					tables.tabs.update({
						id: String(tabId),
						window_id: String(newWindowId),
						index: newPosition,
					});
				},
			);

			browser.tabs.onDetached.addListener((_tabId, _detachInfo) => {
				// Tab is being moved to another window; onAttached will handle the update
			});

			// --- Window Events ---

			browser.windows.onCreated.addListener((win) => {
				if (win.id === undefined) return;
				tables.windows.upsert(chromeWindowToRow(win));
			});

			browser.windows.onRemoved.addListener((windowId) => {
				tables.windows.delete({ id: String(windowId) });
				// Note: Tabs are automatically removed by their own onRemoved events
			});

			browser.windows.onFocusChanged.addListener((windowId) => {
				tables.$transact(() => {
					// Unfocus all windows
					const focusedWindows = tables.windows.filter((w) => w.focused);
					for (const win of focusedWindows) {
						tables.windows.update({ id: win.id, focused: false });
					}
					// Focus the new window (if not WINDOW_ID_NONE)
					if (windowId !== browser.windows.WINDOW_ID_NONE) {
						tables.windows.update({ id: String(windowId), focused: true });
					}
				});
			});

			// --- Tab Group Events (Chrome 88+ only) ---

			if (browser.tabGroups) {
				browser.tabGroups.onCreated.addListener((group) => {
					tables.tab_groups.upsert(chromeTabGroupToRow(group));
				});

				browser.tabGroups.onRemoved.addListener((group) => {
					tables.tab_groups.delete({ id: String(group.id) });
				});

				browser.tabGroups.onUpdated.addListener((group) => {
					tables.tab_groups.upsert(chromeTabGroupToRow(group));
				});
			}

			console.log('[Background] Chrome sync listeners registered');

			return defineProviderExports({
				syncAllFromChrome,
			});
		},
	},
	exports: ({ tables, providers }) => {
		return {
			/**
			 * Get the tables for direct access.
			 */
			tables,

			/**
			 * Wait for IndexedDB to finish initial sync.
			 */
			get whenSynced() {
				return providers.persistence.whenSynced;
			},

			/**
			 * Perform a full sync from Chrome to Y.Doc.
			 * Clears existing data and re-syncs all tabs/windows.
			 */
			syncAllFromChrome: providers.chromeSync.syncAllFromChrome,

			/**
			 * Get all tabs sorted by index.
			 */
			getAllTabs(): Tab[] {
				return tables.tabs.getAllValid().sort((a, b) => a.index - b.index);
			},

			/**
			 * Get all windows.
			 */
			getAllWindows(): Window[] {
				return tables.windows.getAllValid();
			},

			/**
			 * Get tabs for a specific window.
			 */
			getTabsByWindow(windowId: string): Tab[] {
				return tables.tabs
					.filter((t) => t.window_id === windowId)
					.sort((a, b) => a.index - b.index);
			},
		};
	},
});
