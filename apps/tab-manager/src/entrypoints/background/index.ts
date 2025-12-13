/**
 * Background service worker for Tab Manager.
 *
 * This is the hub of the extension:
 * 1. Holds the authoritative Y.Doc
 * 2. Syncs Chrome ↔ Y.Doc (bidirectional)
 * 3. Syncs Y.Doc ↔ Server via WebSocket
 *
 * Bidirectional sync:
 * - Downstream (Chrome → Y.Doc): Chrome events trigger refetch functions
 * - Upstream (Y.Doc → Chrome): Y.Doc observers trigger Chrome APIs
 *
 * Note: No persistence needed. Tab data is ephemeral - Chrome is always
 * the source of truth on startup, and tab IDs change on browser restart.
 *
 * Sync strategy:
 * - `refetchTabs()` / `refetchWindows()` / `refetchTabGroups()`: Diff Chrome state into Y.Doc
 * - Chrome events trigger these refetch functions to keep Y.Doc in sync
 * - Y.Doc observers call Chrome APIs (e.g., browser.tabs.remove) for upstream sync
 * - Coordination flags prevent infinite loops between the two directions
 */

import { createWorkspaceClient, defineWorkspace } from '@epicenter/hq';
import { createWebsocketSyncProvider } from '@epicenter/hq/providers/websocket-sync';
import { defineBackground } from 'wxt/utils/define-background';
import {
	chromeTabGroupToRow,
	chromeTabToRow,
	chromeWindowToRow,
} from '$lib/chrome-helpers';
import { type Tab, type Window } from '$lib/epicenter/browser.schema';
import { BROWSER_SCHEMA } from '$lib/epicenter/schema';

// ─────────────────────────────────────────────────────────────────────────────
// Sync Coordination
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bidirectional sync coordination state.
 *
 * Prevents infinite loops during two-way synchronization between Chrome and Y.Doc:
 * 1. Y.Doc deletion → calls browser.tabs.remove() → triggers Chrome onRemoved event
 * 2. Chrome onRemoved → calls refetchTabs() → tries to delete from Y.Doc
 * 3. Without coordination: step 2 would fire Y.Doc observer again (infinite loop)
 *
 * Solution: Set flags before making changes, check flags before processing events.
 */
const syncCoordination = {
	/** True when we're processing a Y.Doc change (calling Chrome APIs) */
	isProcessingYDocChange: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Workspace Definition
// ─────────────────────────────────────────────────────────────────────────────

const backgroundWorkspace = defineWorkspace({
	id: 'browser',
	tables: BROWSER_SCHEMA,
	providers: {
		/**
		 * WebSocket sync provider for server connection.
		 */
		serverSync: createWebsocketSyncProvider({
			url: 'ws://localhost:3913/sync',
		}),
	},
	exports: ({ tables }) => ({
		tables,

		/**
		 * Refetch tabs from Chrome and diff into Y.Doc.
		 * Like TanStack Query's invalidateQueries, but for Y.Doc.
		 */
		async refetchTabs() {
			const chromeTabs = await browser.tabs.query({});
			const chromeTabIds = new Set(
				chromeTabs.filter((t) => t.id !== undefined).map((t) => String(t.id)),
			);
			const existingYDocTabs = tables.tabs.getAllValid();

			tables.$transact(() => {
				// Upsert all Chrome tabs
				for (const tab of chromeTabs) {
					if (tab.id === undefined) continue;
					tables.tabs.upsert(chromeTabToRow(tab));
				}

				// Delete Y.Doc tabs not in Chrome
				for (const existing of existingYDocTabs) {
					if (!chromeTabIds.has(existing.id)) {
						tables.tabs.delete({ id: existing.id });
					}
				}
			});
		},

		/**
		 * Refetch windows from Chrome and diff into Y.Doc.
		 */
		async refetchWindows() {
			const chromeWindows = await browser.windows.getAll();
			const chromeWindowIds = new Set(
				chromeWindows
					.filter((w) => w.id !== undefined)
					.map((w) => String(w.id)),
			);
			const existingYDocWindows = tables.windows.getAllValid();

			tables.$transact(() => {
				// Upsert all Chrome windows
				for (const win of chromeWindows) {
					if (win.id === undefined) continue;
					tables.windows.upsert(chromeWindowToRow(win));
				}

				// Delete Y.Doc windows not in Chrome
				for (const existing of existingYDocWindows) {
					if (!chromeWindowIds.has(existing.id)) {
						tables.windows.delete({ id: existing.id });
					}
				}
			});
		},

		/**
		 * Refetch tab groups from Chrome and diff into Y.Doc.
		 */
		async refetchTabGroups() {
			if (!browser.tabGroups) return;

			const chromeGroups = await browser.tabGroups.query({});
			const chromeGroupIds = new Set(chromeGroups.map((g) => String(g.id)));
			const existingYDocGroups = tables.tab_groups.getAllValid();

			tables.$transact(() => {
				// Upsert all Chrome groups
				for (const group of chromeGroups) {
					tables.tab_groups.upsert(chromeTabGroupToRow(group));
				}

				// Delete Y.Doc groups not in Chrome
				for (const existing of existingYDocGroups) {
					if (!chromeGroupIds.has(existing.id)) {
						tables.tab_groups.delete({ id: existing.id });
					}
				}
			});
		},

		/**
		 * Refetch all (tabs, windows, tab groups) from Chrome.
		 */
		async refetchAll() {
			// Refetch windows first (tabs reference windows)
			await this.refetchWindows();
			await this.refetchTabs();
			await this.refetchTabGroups();

			console.log('[Background] Refetched all from Chrome:', {
				tabs: tables.tabs.getAllValid().length,
				windows: tables.windows.getAllValid().length,
				tabGroups: tables.tab_groups.getAllValid().length,
			});
		},

		getAllTabs(): Tab[] {
			return tables.tabs.getAllValid().sort((a, b) => a.index - b.index);
		},

		getAllWindows(): Window[] {
			return tables.windows.getAllValid();
		},

		getTabsByWindow(windowId: string): Tab[] {
			return tables.tabs
				.filter((t) => t.window_id === windowId)
				.sort((a, b) => a.index - b.index);
		},
	}),
});

// ─────────────────────────────────────────────────────────────────────────────
// Background Service Worker
// ─────────────────────────────────────────────────────────────────────────────

export default defineBackground(async () => {
	console.log('[Background] Initializing Tab Manager...');

	const client = createWorkspaceClient(backgroundWorkspace);

	// Initial sync: Diff Chrome state into Y.Doc
	// No persistence needed - Chrome is always the source of truth
	await client.refetchAll();

	// ─────────────────────────────────────────────────────────────────────────
	// Chrome Event Listeners - trigger Y.Doc refetch on changes
	// Like TanStack Query's invalidateQueries pattern
	// Skip when we're processing Y.Doc changes to prevent infinite loops
	// ─────────────────────────────────────────────────────────────────────────

	const refetchTabsIfNotProcessingYDoc = () => {
		if (!syncCoordination.isProcessingYDocChange) {
			client.refetchTabs();
		}
	};

	const refetchWindowsIfNotProcessingYDoc = () => {
		if (!syncCoordination.isProcessingYDocChange) {
			client.refetchWindows();
		}
	};

	const refetchTabGroupsIfNotProcessingYDoc = () => {
		if (!syncCoordination.isProcessingYDocChange) {
			client.refetchTabGroups();
		}
	};

	// Tab events → refetch tabs
	browser.tabs.onCreated.addListener(refetchTabsIfNotProcessingYDoc);
	browser.tabs.onRemoved.addListener(refetchTabsIfNotProcessingYDoc);
	browser.tabs.onUpdated.addListener(refetchTabsIfNotProcessingYDoc);
	browser.tabs.onMoved.addListener(refetchTabsIfNotProcessingYDoc);
	browser.tabs.onActivated.addListener(refetchTabsIfNotProcessingYDoc);
	browser.tabs.onAttached.addListener(refetchTabsIfNotProcessingYDoc);
	browser.tabs.onDetached.addListener(refetchTabsIfNotProcessingYDoc);

	// Window events → refetch windows
	browser.windows.onCreated.addListener(refetchWindowsIfNotProcessingYDoc);
	browser.windows.onRemoved.addListener(refetchWindowsIfNotProcessingYDoc);
	browser.windows.onFocusChanged.addListener(refetchWindowsIfNotProcessingYDoc);

	// Tab group events → refetch tab groups (Chrome 88+ only)
	if (browser.tabGroups) {
		browser.tabGroups.onCreated.addListener(refetchTabGroupsIfNotProcessingYDoc);
		browser.tabGroups.onRemoved.addListener(refetchTabGroupsIfNotProcessingYDoc);
		browser.tabGroups.onUpdated.addListener(refetchTabGroupsIfNotProcessingYDoc);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Y.Doc Observers - trigger Chrome APIs on upstream changes
	// These handle changes synced from the server (e.g., markdown file deletions)
	// ─────────────────────────────────────────────────────────────────────────

	client.tables.tabs.observe({
		onDelete: async (id) => {
			// Skip if this deletion came from our own refetch (downstream sync)
			if (syncCoordination.isProcessingYDocChange) return;

			syncCoordination.isProcessingYDocChange = true;
			try {
				const tabId = Number.parseInt(id, 10);
				if (!Number.isNaN(tabId)) {
					await browser.tabs.remove(tabId);
				}
			} catch (error) {
				// Tab may already be closed or not exist
				console.log(`[Background] Failed to close tab ${id}:`, error);
			} finally {
				syncCoordination.isProcessingYDocChange = false;
			}
		},
	});

	client.tables.windows.observe({
		onDelete: async (id) => {
			if (syncCoordination.isProcessingYDocChange) return;

			syncCoordination.isProcessingYDocChange = true;
			try {
				const windowId = Number.parseInt(id, 10);
				if (!Number.isNaN(windowId)) {
					await browser.windows.remove(windowId);
				}
			} catch (error) {
				console.log(`[Background] Failed to close window ${id}:`, error);
			} finally {
				syncCoordination.isProcessingYDocChange = false;
			}
		},
	});

	if (browser.tabGroups) {
		client.tables.tab_groups.observe({
			onDelete: async (id) => {
				if (syncCoordination.isProcessingYDocChange) return;

				syncCoordination.isProcessingYDocChange = true;
				try {
					const groupId = Number.parseInt(id, 10);
					if (!Number.isNaN(groupId)) {
						// Note: Chrome doesn't have tabGroups.remove(), but we can ungroup tabs
						const tabs = await browser.tabs.query({ groupId });
						for (const tab of tabs) {
							if (tab.id !== undefined) {
								await browser.tabs.ungroup(tab.id);
							}
						}
					}
				} catch (error) {
					console.log(`[Background] Failed to ungroup tab group ${id}:`, error);
				} finally {
					syncCoordination.isProcessingYDocChange = false;
				}
			},
		});
	}

	console.log('[Background] Tab Manager initialized', {
		tabs: client.getAllTabs().length,
		windows: client.getAllWindows().length,
	});
});
