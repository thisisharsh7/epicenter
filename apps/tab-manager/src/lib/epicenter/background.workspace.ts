/**
 * Background workspace definition.
 *
 * Used in the background service worker context. This is the authoritative
 * Y.Doc holder that:
 * - Persists to IndexedDB
 * - Syncs Chrome tabs/windows state to Y.Doc
 * - Serves Y.Doc updates to connected popups
 */

import { defineProviderExports, defineWorkspace } from '@epicenter/hq';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { type Tab, type TabGroup, type Window } from './browser.schema';
import { BROWSER_SCHEMA, type SyncMessage } from './schema';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: Convert Chrome types to schema rows
// ─────────────────────────────────────────────────────────────────────────────

function chromeTabToRow(tab: Browser.tabs.Tab): Tab {
	return {
		id: String(tab.id),
		window_id: String(tab.windowId),
		url: tab.url ?? '',
		title: tab.title ?? '',
		fav_icon_url: tab.favIconUrl ?? null,
		index: tab.index,
		pinned: tab.pinned,
		active: tab.active,
		highlighted: tab.highlighted,
		muted: tab.mutedInfo?.muted ?? false,
		audible: tab.audible ?? false,
		discarded: tab.discarded,
		auto_discardable: tab.autoDiscardable ?? true,
		status: tab.status ?? 'complete',
		group_id:
			tab.groupId !== undefined && tab.groupId !== -1
				? String(tab.groupId)
				: null,
		opener_tab_id:
			tab.openerTabId !== undefined ? String(tab.openerTabId) : null,
		incognito: tab.incognito ?? false,
	};
}

function chromeWindowToRow(win: Browser.windows.Window): Window {
	return {
		id: String(win.id),
		state: win.state ?? 'normal',
		type: win.type ?? 'normal',
		focused: win.focused ?? false,
		always_on_top: win.alwaysOnTop ?? false,
		incognito: win.incognito ?? false,
		top: win.top ?? 0,
		left: win.left ?? 0,
		width: win.width ?? 800,
		height: win.height ?? 600,
	};
}

function chromeTabGroupToRow(group: Browser.tabGroups.TabGroup): TabGroup {
	return {
		id: String(group.id),
		window_id: String(group.windowId),
		title: group.title ?? null,
		color: group.color ?? 'grey',
		collapsed: group.collapsed ?? false,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Workspace Definition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Background workspace - the authoritative Y.Doc holder.
 *
 * Providers:
 * - `persistence`: IndexedDB persistence via y-indexeddb
 * - `popupSync`: Handles popup connections and syncs Y.Doc to them
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
		 * Popup sync provider.
		 *
		 * Listens for popup connections via chrome.runtime.onConnect and
		 * syncs Y.Doc state to connected popups.
		 */
		popupSync: ({ ydoc }) => {
			browser.runtime.onConnect.addListener((port: Browser.runtime.Port) => {
				// Only handle yjs-sync connections
				if (port.name !== 'yjs-sync') return;

				console.log('[Background] Popup connected');

				// Send full state to popup on connect
				const state = Y.encodeStateAsUpdate(ydoc);
				const message: SyncMessage = {
					type: 'sync-state',
					state: Array.from(state),
				};
				port.postMessage(message);

				// Listen for updates from popup
				port.onMessage.addListener((msg: SyncMessage) => {
					if (msg.type === 'update') {
						// Apply update from popup
						// Use 'popup' as origin to prevent echoing back
						Y.applyUpdate(ydoc, new Uint8Array(msg.update), 'popup');
					}
				});

				// Forward Y.Doc updates to popup
				const updateHandler = (update: Uint8Array, origin: unknown) => {
					// Don't echo back updates that came from this popup
					if (origin === 'popup') return;

					const message: SyncMessage = {
						type: 'update',
						update: Array.from(update),
					};
					port.postMessage(message);
				};

				ydoc.on('update', updateHandler);

				// Clean up on disconnect
				port.onDisconnect.addListener(() => {
					console.log('[Background] Popup disconnected');
					ydoc.off('update', updateHandler);
				});
			});

			console.log('[Background] Popup sync listener registered');
		},

		/**
		 * Chrome sync provider.
		 *
		 * Sets up Chrome event listeners that sync Chrome state → Y.Doc.
		 * Exports `syncAllFromChrome` for initial/full sync.
		 */
		chromeSync: ({ tables }) => {
			// ═══════════════════════════════════════════════════════════════════════════
			// INITIAL SYNC - Destructive sync on startup
			// ═══════════════════════════════════════════════════════════════════════════

			async function syncAllFromChrome() {
				console.log('[Background] Starting full sync from Chrome...');

				// Get all windows and tabs from Chrome
				const [chromeTabs, chromeWindows] = await Promise.all([
					browser.tabs.query({}),
					browser.windows.getAll(),
				]);

				tables.$transact(() => {
					// Clear existing data
					tables.$clearAll();

					// Sync windows first (tabs reference windows)
					for (const win of chromeWindows) {
						if (win.id === undefined) continue;
						tables.windows.upsert(chromeWindowToRow(win));
					}

					// Sync tabs
					for (const tab of chromeTabs) {
						if (tab.id === undefined) continue;
						tables.tabs.upsert(chromeTabToRow(tab));
					}
				});

				// Sync tab groups (Chrome 88+ only)
				if (browser.tabGroups) {
					const chromeGroups = await browser.tabGroups.query({});
					tables.$transact(() => {
						for (const group of chromeGroups) {
							tables.tab_groups.upsert(chromeTabGroupToRow(group));
						}
					});
				}

				console.log(
					`[Background] Synced ${chromeTabs.length} tabs, ${chromeWindows.length} windows`,
				);
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
		// Type assertions for provider exports
		// TypeScript can't infer these through the generic chain
		const persistence = providers.persistence as {
			whenSynced: Promise<IndexeddbPersistence>;
		};
		const chromeSync = providers.chromeSync as {
			syncAllFromChrome: () => Promise<void>;
		};

		return {
			/**
			 * Get the tables for direct access.
			 */
			tables,

			/**
			 * Wait for IndexedDB to finish initial sync.
			 */
			get whenSynced() {
				return persistence.whenSynced;
			},

			/**
			 * Perform a full sync from Chrome to Y.Doc.
			 * Clears existing data and re-syncs all tabs/windows.
			 */
			syncAllFromChrome: chromeSync.syncAllFromChrome,

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
