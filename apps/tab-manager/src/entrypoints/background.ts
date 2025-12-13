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
import { Ok, tryAsync } from 'wellcrafted/result';
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
 * Prevents infinite loops during two-way synchronization between Chrome and Y.Doc.
 *
 * Primary mechanism: Y.js transaction `origin` parameter
 * - Remote changes (from WebSocket): origin !== null (WebSocket provider instance)
 * - Local changes (our refetch): origin === null (default Y.js behavior)
 *
 * The observers check `origin` to distinguish remote vs local changes and only
 * act on remote changes (when a markdown file changes on the server).
 *
 * Flags for secondary coordination:
 * - `isProcessingYDocChange`: Set when calling Chrome APIs from Y.Doc observers
 *   Prevents Chrome events from triggering refetch during our own API calls.
 * - `isRefetching`: Set when syncing Chrome → Y.Doc (refetch functions)
 *   Used as a secondary guard in refetch helpers.
 */
const syncCoordination = {
	/** True when we're processing a Y.Doc change (calling Chrome APIs) */
	isProcessingYDocChange: false,
	/** True when we're refetching Chrome state into Y.Doc */
	isRefetching: false,
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

// NOTE: defineBackground callback CANNOT be async (MV3 constraint).
// Event listeners must be registered synchronously at the top level.
// We use the "deferred handler" pattern: store initPromise, await it in handlers.
export default defineBackground(() => {
	console.log('[Background] Initializing Tab Manager...');

	const client = createWorkspaceClient(backgroundWorkspace);

	// Debug: Listen for all Y.Doc updates to see if we're receiving them
	client.$ydoc.on('update', (update: Uint8Array, origin: unknown) => {
		console.log('[Background] Y.Doc update received', {
			updateSize: update.length,
			origin: origin === null ? 'local' : 'remote',
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Initialization Promise (Deferred Handler Pattern)
	// All event handlers await this before processing to avoid race conditions.
	// This ensures Chrome state is synced to Y.Doc before any handler runs.
	// ─────────────────────────────────────────────────────────────────────────

	const initPromise = client
		.refetchAll()
		.then(() => console.log('[Background] Initial refetch complete'))
		.catch((err) => console.error('[Background] Initial refetch failed:', err));

	// ─────────────────────────────────────────────────────────────────────────
	// Chrome Keepalive (Chrome MV3 only)
	// Chrome service workers go dormant after ~30 seconds of inactivity.
	// We use Chrome Alarms API to wake the service worker periodically,
	// keeping the WebSocket connection alive for real-time Y.Doc sync.
	// Firefox doesn't have this limitation (uses Event Pages, not service workers).
	//
	// NOTE: WebSocket messages from the server CANNOT wake a dormant service worker.
	// When dormant, the WebSocket connection is suspended/closed. Only Chrome events
	// (alarms, tabs, runtime messages, etc.) can wake the worker.
	// ─────────────────────────────────────────────────────────────────────────

	if (import.meta.env.CHROME && browser.alarms) {
		const KEEPALIVE_ALARM = 'keepalive';
		const KEEPALIVE_INTERVAL_MINUTES = 0.4; // ~24 seconds (under 30s threshold)

		// Create the keepalive alarm
		browser.alarms.create(KEEPALIVE_ALARM, {
			periodInMinutes: KEEPALIVE_INTERVAL_MINUTES,
		});

		// Handle alarm - the act of waking the service worker keeps the WebSocket alive
		browser.alarms.onAlarm.addListener((alarm) => {
			if (alarm.name === KEEPALIVE_ALARM) {
				// No-op: just waking the service worker is sufficient
			}
		});
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Lifecycle Events - Re-sync on explicit browser events
	// onInstalled: Extension install, update, or Chrome update
	// onStartup: Browser session start (user profile loads)
	// ─────────────────────────────────────────────────────────────────────────

	browser.runtime.onInstalled.addListener(async () => {
		console.log('[Background] onInstalled: re-syncing...');
		await client
			.refetchAll()
			.then(() => console.log('[Background] onInstalled: refetch complete'))
			.catch((err) =>
				console.error('[Background] onInstalled: refetch failed:', err),
			);
	});

	browser.runtime.onStartup.addListener(async () => {
		console.log('[Background] onStartup: re-syncing...');
		await client
			.refetchAll()
			.then(() => console.log('[Background] onStartup: refetch complete'))
			.catch((err) =>
				console.error('[Background] onStartup: refetch failed:', err),
			);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Chrome Event Listeners - trigger Y.Doc refetch on changes
	// Like TanStack Query's invalidateQueries pattern
	// Each handler awaits initPromise first to avoid race conditions.
	// Skip when we're processing Y.Doc changes to prevent infinite loops.
	// ─────────────────────────────────────────────────────────────────────────

	const refetchTabsIfNotProcessingYDoc = async () => {
		await initPromise;
		if (syncCoordination.isProcessingYDocChange) return;
		syncCoordination.isRefetching = true;
		await client.refetchTabs();
		syncCoordination.isRefetching = false;
	};

	const refetchWindowsIfNotProcessingYDoc = async () => {
		await initPromise;
		if (syncCoordination.isProcessingYDocChange) return;
		syncCoordination.isRefetching = true;
		await client.refetchWindows();
		syncCoordination.isRefetching = false;
	};

	const refetchTabGroupsIfNotProcessingYDoc = async () => {
		await initPromise;
		if (syncCoordination.isProcessingYDocChange) return;
		syncCoordination.isRefetching = true;
		await client.refetchTabGroups();
		syncCoordination.isRefetching = false;
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
		onAdd: async (result, transaction) => {
			await initPromise;

			console.log('[Background] tabs.onAdd fired:', {
				origin: transaction.origin,
				isRemote: transaction.origin !== null,
				hasError: !!result.error,
				data: result.error ? String(result.error) : result.data,
			});

			// Only process remote changes (from WebSocket sync)
			// Local changes (transaction.origin === null) are our own refetch operations
			if (transaction.origin === null) {
				console.log('[Background] tabs.onAdd SKIPPED: local origin (our own change)');
				return;
			}
			if (result.error) {
				console.log('[Background] tabs.onAdd SKIPPED: result has error');
				return;
			}

			const row = result.data;
			if (!row.url) {
				console.log('[Background] tabs.onAdd SKIPPED: no URL in row');
				return;
			}

			console.log('[Background] tabs.onAdd CREATING tab with URL:', row.url);
			// Set flag to prevent Chrome events from triggering refetch
			syncCoordination.isProcessingYDocChange = true;
			await tryAsync({
				try: async () => {
					// Create the tab with the URL from the markdown file
					await browser.tabs.create({ url: row.url });
					console.log('[Background] tabs.onAdd tab created, now refetching...');

					// Refetch to clean up - this will:
					// 1. Add the new Chrome tab (with Chrome's real ID)
					// 2. Delete the old row (wrong ID from markdown, not in Chrome)
					syncCoordination.isRefetching = true;
					await client.refetchTabs();
					syncCoordination.isRefetching = false;
					console.log('[Background] tabs.onAdd refetch complete');
				},
				catch: (error) => {
					console.log(`[Background] Failed to create tab from ${row.id}:`, error);
					return Ok(undefined);
				},
			});
			syncCoordination.isProcessingYDocChange = false;
		},
		onDelete: async (id, transaction) => {
			await initPromise;

			console.log('[Background] tabs.onDelete fired:', {
				id,
				origin: transaction.origin,
				isRemote: transaction.origin !== null,
			});

			// Only process remote changes (from WebSocket sync)
			// Local changes (transaction.origin === null) are our own refetch operations
			if (transaction.origin === null) {
				console.log('[Background] tabs.onDelete SKIPPED: local origin (our own change)');
				return;
			}

			console.log('[Background] tabs.onDelete REMOVING Chrome tab:', id);
			// Set flag to prevent Chrome events from triggering refetch
			syncCoordination.isProcessingYDocChange = true;
			await tryAsync({
				try: async () => {
					const tabId = Number.parseInt(id, 10);
					if (!Number.isNaN(tabId)) {
						await browser.tabs.remove(tabId);
						console.log('[Background] tabs.onDelete SUCCESS: removed tab', tabId);
					} else {
						console.log('[Background] tabs.onDelete SKIPPED: invalid tab ID (NaN)');
					}
				},
				catch: (error) => {
					// Tab may already be closed or not exist
					console.log(`[Background] Failed to close tab ${id}:`, error);
					return Ok(undefined);
				},
			});
			syncCoordination.isProcessingYDocChange = false;
		},
	});

	client.tables.windows.observe({
		onAdd: async (result, transaction) => {
			await initPromise;

			// Only process remote changes (from WebSocket sync)
			if (transaction.origin === null) return;
			if (result.error) return;

			syncCoordination.isProcessingYDocChange = true;
			await tryAsync({
				try: async () => {
					// Create a new window
					await browser.windows.create({});

					// Refetch to clean up - this will:
					// 1. Add the new Chrome window (with Chrome's real ID)
					// 2. Delete the old row (wrong ID from markdown, not in Chrome)
					syncCoordination.isRefetching = true;
					await client.refetchWindows();
					syncCoordination.isRefetching = false;
				},
				catch: (error) => {
					console.log(`[Background] Failed to create window from ${result.data.id}:`, error);
					return Ok(undefined);
				},
			});
			syncCoordination.isProcessingYDocChange = false;
		},
		onDelete: async (id, transaction) => {
			await initPromise;

			// Only process remote changes (from WebSocket sync)
			if (transaction.origin === null) return;

			syncCoordination.isProcessingYDocChange = true;
			await tryAsync({
				try: async () => {
					const windowId = Number.parseInt(id, 10);
					if (!Number.isNaN(windowId)) {
						await browser.windows.remove(windowId);
					}
				},
				catch: (error) => {
					console.log(`[Background] Failed to close window ${id}:`, error);
					return Ok(undefined);
				},
			});
			syncCoordination.isProcessingYDocChange = false;
		},
	});

	if (browser.tabGroups) {
		client.tables.tab_groups.observe({
			onDelete: async (id, transaction) => {
				await initPromise;

				// Only process remote changes (from WebSocket sync)
				if (transaction.origin === null) return;

				syncCoordination.isProcessingYDocChange = true;
				await tryAsync({
					try: async () => {
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
					},
					catch: (error) => {
						console.log(`[Background] Failed to ungroup tab group ${id}:`, error);
						return Ok(undefined);
					},
				});
				syncCoordination.isProcessingYDocChange = false;
			},
		});
	}

	console.log('[Background] Tab Manager initialized', {
		tabs: client.getAllTabs().length,
		windows: client.getAllWindows().length,
	});
});
