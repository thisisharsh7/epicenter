/**
 * Background service worker for Tab Manager.
 *
 * This is the hub of the extension:
 * 1. Holds the authoritative Y.Doc
 * 2. Syncs Browser ↔ Y.Doc (bidirectional)
 * 3. Syncs Y.Doc ↔ Server via WebSocket
 *
 * Bidirectional sync:
 * - Downstream (Browser → Y.Doc): Browser events trigger incremental updates
 * - Upstream (Y.Doc → Browser): Y.Doc observers trigger Browser APIs
 *
 * Multi-device sync:
 * - Each device has a unique ID stored in storage.local
 * - All IDs (tab, window, group) are scoped: `${deviceId}_${nativeId}`
 * - Each device only manages its own rows, never deleting other devices' data
 *
 * Sync strategy:
 * - Initial sync: `refetchAll()` queries all tabs/windows/groups from Browser
 * - Incremental sync: Event handlers update only the specific tab/window/group that changed
 * - Y.Doc observers call Browser APIs only for THIS device's data
 * - Coordination flags prevent infinite loops between the two directions
 */

import { createWorkspaceClient, defineWorkspace } from '@epicenter/hq';
import { createWebsocketSyncProvider } from '@epicenter/hq/providers/websocket-sync';
import { Ok, tryAsync } from 'wellcrafted/result';
import { defineBackground } from 'wxt/utils/define-background';
import {
	browserTabGroupToRow,
	browserTabToRow,
	browserWindowToRow,
} from '$lib/browser-helpers';
import {
	createCompositeId,
	generateDefaultDeviceName,
	getBrowserName,
	getDeviceId,
	parseCompositeId,
} from '$lib/device-id';
import { type Tab, type Window } from '$lib/epicenter/browser.schema';
import { BROWSER_SCHEMA } from '$lib/epicenter/schema';

// ─────────────────────────────────────────────────────────────────────────────
// Sync Coordination
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bidirectional sync coordination state.
 *
 * Prevents infinite loops during two-way synchronization between Browser and Y.Doc.
 *
 * Primary mechanism: Y.js transaction `origin` parameter
 * - Remote changes (from WebSocket): origin !== null (WebSocket provider instance)
 * - Local changes (our refetch): origin === null (default Y.js behavior)
 *
 * The observers check `origin` to distinguish remote vs local changes and only
 * act on remote changes (when a markdown file changes on the server).
 *
 * Flags for secondary coordination:
 * - `isProcessingYDocChange`: Set when calling Browser APIs from Y.Doc observers
 *   Prevents Browser events from triggering refetch during our own API calls.
 * - `isRefetching`: Set when syncing Browser → Y.Doc (refetch functions)
 *   Used as a secondary guard in refetch helpers.
 */
const syncCoordination = {
	/** True when we're processing a Y.Doc change (calling Browser APIs) */
	isProcessingYDocChange: false,
	/** True when we're refetching Browser state into Y.Doc */
	isRefetching: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Background Service Worker
// ─────────────────────────────────────────────────────────────────────────────

// NOTE: defineBackground callback CANNOT be async (MV3 constraint).
// Event listeners must be registered synchronously at the top level.
// We use the "deferred handler" pattern: store initPromise, await it in handlers.
export default defineBackground(() => {
	console.log('[Background] Initializing Tab Manager...');

	// Get device ID early (cached after first call)
	const deviceIdPromise = getDeviceId();

	// ─────────────────────────────────────────────────────────────────────────
	// Workspace Definition (needs deviceId for refetch functions)
	// ─────────────────────────────────────────────────────────────────────────

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
			 * Register this device in the devices table.
			 */
			async registerDevice() {
				const deviceId = await deviceIdPromise;
				const existingDevice = tables.devices.get({ id: deviceId });

				// Get existing name if valid, otherwise generate default
				const existingName =
					existingDevice.status === 'valid' ? existingDevice.row.name : null;

				tables.devices.upsert({
					id: deviceId,
					// Keep existing name if set, otherwise generate default
					name: existingName ?? (await generateDefaultDeviceName()),
					last_seen: new Date().toISOString(),
					browser: getBrowserName(),
				});
			},

			/**
			 * Refetch tabs from Browser and diff into Y.Doc.
			 * Only manages THIS device's tabs - other devices' tabs are untouched.
			 */
			async refetchTabs() {
				const deviceId = await deviceIdPromise;
				const browserTabs = await browser.tabs.query({});
				const tabIds = new Set(
					browserTabs.filter((t) => t.id !== undefined).map((t) => t.id!),
				);
				const existingYDocTabs = tables.tabs.getAllValid();

				tables.$transact(() => {
					// Upsert all browser tabs (with device-scoped IDs)
					for (const tab of browserTabs) {
						if (tab.id === undefined) continue;
						tables.tabs.upsert(browserTabToRow({ tab, deviceId }));
					}

					// Delete only THIS device's tabs that aren't in browser
					for (const existing of existingYDocTabs) {
						if (existing.device_id !== deviceId) continue; // Skip other devices!
						if (!tabIds.has(existing.tab_id)) {
							tables.tabs.delete({ id: existing.id });
						}
					}
				});
			},

			/**
			 * Refetch windows from Browser and diff into Y.Doc.
			 * Only manages THIS device's windows - other devices' windows are untouched.
			 */
			async refetchWindows() {
				const deviceId = await deviceIdPromise;
				const browserWindows = await browser.windows.getAll();
				const windowIds = new Set(
					browserWindows.filter((w) => w.id !== undefined).map((w) => w.id!),
				);
				const existingYDocWindows = tables.windows.getAllValid();

				tables.$transact(() => {
					// Upsert all browser windows (with device-scoped IDs)
					for (const win of browserWindows) {
						if (win.id === undefined) continue;
						tables.windows.upsert(browserWindowToRow({ window: win, deviceId }));
					}

					// Delete only THIS device's windows that aren't in browser
					for (const existing of existingYDocWindows) {
						if (existing.device_id !== deviceId) continue; // Skip other devices!
						if (!windowIds.has(existing.window_id)) {
							tables.windows.delete({ id: existing.id });
						}
					}
				});
			},

			/**
			 * Refetch tab groups from Browser and diff into Y.Doc.
			 * Only manages THIS device's groups - other devices' groups are untouched.
			 */
			async refetchTabGroups() {
				if (!browser.tabGroups) return;

				const deviceId = await deviceIdPromise;
				const browserGroups = await browser.tabGroups.query({});
				const groupIds = new Set(browserGroups.map((g) => g.id));
				const existingYDocGroups = tables.tab_groups.getAllValid();

				tables.$transact(() => {
					// Upsert all browser groups (with device-scoped IDs)
					for (const group of browserGroups) {
						tables.tab_groups.upsert(browserTabGroupToRow({ group, deviceId }));
					}

					// Delete only THIS device's groups that aren't in browser
					for (const existing of existingYDocGroups) {
						if (existing.device_id !== deviceId) continue; // Skip other devices!
						if (!groupIds.has(existing.group_id)) {
							tables.tab_groups.delete({ id: existing.id });
						}
					}
				});
			},

			/**
			 * Refetch all (tabs, windows, tab groups) from Browser.
			 */
			async refetchAll() {
				// Register device first
				await this.registerDevice();
				// Refetch windows first (tabs reference windows)
				await this.refetchWindows();
				await this.refetchTabs();
				await this.refetchTabGroups();

				console.log('[Background] Refetched all from Browser:', {
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

	const client = createWorkspaceClient(backgroundWorkspace);

	// Debug: Listen for all Y.Doc updates to see if we're receiving them
	client.$ydoc.on('update', (update: Uint8Array, origin: unknown) => {
		// Get the ytables Y.Map to inspect structure
		const ytables = client.$ydoc.getMap('tables');
		const tabsTable = ytables.get('tabs') as Map<string, unknown> | undefined;

		// Get entries from tabs table if it's a Y.Map
		let tabsEntries: string[] = [];
		if (tabsTable && typeof tabsTable.keys === 'function') {
			tabsEntries = Array.from(tabsTable.keys()).slice(0, 5);
		}

		console.log('[Background] Y.Doc update received', {
			updateSize: update.length,
			origin: origin === null ? 'local' : 'remote',
			ytablesSize: ytables.size,
			ytablesKeys: Array.from(ytables.keys()),
			tabsTableExists: !!tabsTable,
			tabsTableSize: tabsTable?.size ?? 'N/A',
			tabsFirstFiveKeys: tabsEntries,
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Initialization Promise (Deferred Handler Pattern)
	// All event handlers await this before processing to avoid race conditions.
	// This ensures Browser state is synced to Y.Doc before any handler runs.
	// ─────────────────────────────────────────────────────────────────────────

	const initPromise = client
		.refetchAll()
		.then(() => console.log('[Background] Initial refetch complete'))
		.catch((err) => console.error('[Background] Initial refetch failed:', err));

	// ─────────────────────────────────────────────────────────────────────────
	// Browser Keepalive (Chrome MV3 only)
	// Chrome service workers go dormant after ~30 seconds of inactivity.
	// We use Chrome Alarms API to wake the service worker periodically,
	// keeping the WebSocket connection alive for real-time Y.Doc sync.
	// Firefox doesn't have this limitation (uses Event Pages, not service workers).
	//
	// NOTE: WebSocket messages from the server CANNOT wake a dormant service worker.
	// When dormant, the WebSocket connection is suspended/closed. Only Browser events
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
	// onInstalled: Extension install, update, or Browser update
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
	// Browser Event Listeners - Incremental Updates
	// Instead of refetching ALL tabs on every event, we only update the
	// specific tab/window/group that changed. This dramatically reduces
	// YJS operations (from N upserts to 1 upsert per event).
	// ─────────────────────────────────────────────────────────────────────────

	const { tables } = client;

	// Helper: Upsert a single tab by querying Browser (for events that don't provide full tab)
	const upsertTabById = async (tabId: number) => {
		const deviceId = await deviceIdPromise;
		await tryAsync({
			try: async () => {
				const tab = await browser.tabs.get(tabId);
				tables.tabs.upsert(browserTabToRow({ tab, deviceId }));
			},
			catch: (error) => {
				// Tab may have been closed already
				console.warn(`[Background] Failed to get tab ${tabId}:`, error);
				return Ok(undefined);
			},
		});
	};

	// Helper: Upsert a single window by querying Browser
	const upsertWindowById = async (windowId: number) => {
		const deviceId = await deviceIdPromise;
		await tryAsync({
			try: async () => {
				const window = await browser.windows.get(windowId);
				tables.windows.upsert(browserWindowToRow({ window, deviceId }));
			},
			catch: (error) => {
				// Window may have been closed already
				console.warn(`[Background] Failed to get window ${windowId}:`, error);
				return Ok(undefined);
			},
		});
	};

	// ─────────────────────────────────────────────────────────────────────────
	// Tab Event Handlers - Incremental updates (1 tab at a time)
	// ─────────────────────────────────────────────────────────────────────────

	// onCreated: Full Tab object provided
	browser.tabs.onCreated.addListener(async (tab) => {
		await initPromise;
		if (syncCoordination.isProcessingYDocChange) return;
		if (tab.id === undefined) return;

		const deviceId = await deviceIdPromise;
		syncCoordination.isRefetching = true;
		tables.tabs.upsert(browserTabToRow({ tab, deviceId }));
		syncCoordination.isRefetching = false;
	});

	// onRemoved: Only tabId provided - delete directly
	browser.tabs.onRemoved.addListener(async (tabId) => {
		await initPromise;
		if (syncCoordination.isProcessingYDocChange) return;

		const deviceId = await deviceIdPromise;
		syncCoordination.isRefetching = true;
		tables.tabs.delete({ id: createCompositeId({ deviceId, id: tabId }) });
		syncCoordination.isRefetching = false;
	});

	// onUpdated: Full Tab object provided (3rd arg)
	browser.tabs.onUpdated.addListener(async (_tabId, _changeInfo, tab) => {
		await initPromise;
		if (syncCoordination.isProcessingYDocChange) return;
		if (tab.id === undefined) return;

		const deviceId = await deviceIdPromise;
		syncCoordination.isRefetching = true;
		tables.tabs.upsert(browserTabToRow({ tab, deviceId }));
		syncCoordination.isRefetching = false;
	});

	// onMoved: Only tabId + moveInfo provided - need to query Browser
	browser.tabs.onMoved.addListener(async (tabId) => {
		await initPromise;
		if (syncCoordination.isProcessingYDocChange) return;

		syncCoordination.isRefetching = true;
		await upsertTabById(tabId);
		syncCoordination.isRefetching = false;
	});

	// onActivated: Only activeInfo provided - need to query Browser
	// Note: We need to update BOTH the newly activated tab AND the previously active tab
	// in the same window (to set active: false on the old one)
	browser.tabs.onActivated.addListener(async (activeInfo) => {
		await initPromise;
		if (syncCoordination.isProcessingYDocChange) return;

		const deviceId = await deviceIdPromise;
		syncCoordination.isRefetching = true;

		const deviceWindowId = createCompositeId({
			deviceId,
			id: activeInfo.windowId,
		});
		const deviceTabId = createCompositeId({ deviceId, id: activeInfo.tabId });

		// Find and update the previously active tab in this window (set active: false)
		const previouslyActiveTabs = tables.tabs
			.filter((t) => t.window_id === deviceWindowId && t.active)
			.filter((t) => t.id !== deviceTabId);

		for (const prevTab of previouslyActiveTabs) {
			tables.tabs.upsert({ ...prevTab, active: false });
		}

		// Update the newly activated tab
		await upsertTabById(activeInfo.tabId);

		syncCoordination.isRefetching = false;
	});

	// onAttached: Tab moved between windows - need to query Browser
	browser.tabs.onAttached.addListener(async (tabId) => {
		await initPromise;
		if (syncCoordination.isProcessingYDocChange) return;

		syncCoordination.isRefetching = true;
		await upsertTabById(tabId);
		syncCoordination.isRefetching = false;
	});

	// onDetached: Tab detached from window - need to query Browser
	browser.tabs.onDetached.addListener(async (tabId) => {
		await initPromise;
		if (syncCoordination.isProcessingYDocChange) return;

		syncCoordination.isRefetching = true;
		await upsertTabById(tabId);
		syncCoordination.isRefetching = false;
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Window Event Handlers - Incremental updates (1 window at a time)
	// ─────────────────────────────────────────────────────────────────────────

	// onCreated: Full Window object provided
	browser.windows.onCreated.addListener(async (window) => {
		await initPromise;
		if (syncCoordination.isProcessingYDocChange) return;
		if (window.id === undefined) return;

		const deviceId = await deviceIdPromise;
		syncCoordination.isRefetching = true;
		tables.windows.upsert(browserWindowToRow({ window, deviceId }));
		syncCoordination.isRefetching = false;
	});

	// onRemoved: Only windowId provided - delete directly
	browser.windows.onRemoved.addListener(async (windowId) => {
		await initPromise;
		if (syncCoordination.isProcessingYDocChange) return;

		const deviceId = await deviceIdPromise;
		syncCoordination.isRefetching = true;
		tables.windows.delete({
			id: createCompositeId({ deviceId, id: windowId }),
		});
		syncCoordination.isRefetching = false;
	});

	// onFocusChanged: Only windowId provided - need to query Browser
	// Note: windowId can be WINDOW_ID_NONE (-1) when all windows lose focus
	// We need to update BOTH the newly focused window AND previously focused windows
	browser.windows.onFocusChanged.addListener(async (windowId) => {
		await initPromise;
		if (syncCoordination.isProcessingYDocChange) return;

		const deviceId = await deviceIdPromise;
		syncCoordination.isRefetching = true;

		const deviceWindowId = createCompositeId({ deviceId, id: windowId });

		// Find and update previously focused windows (set focused: false)
		const previouslyFocusedWindows = tables.windows
			.filter((w) => w.focused)
			.filter((w) => w.id !== deviceWindowId);

		for (const prevWindow of previouslyFocusedWindows) {
			tables.windows.upsert({ ...prevWindow, focused: false });
		}

		// Update the newly focused window (if not WINDOW_ID_NONE)
		if (windowId !== browser.windows.WINDOW_ID_NONE) {
			await upsertWindowById(windowId);
		}

		syncCoordination.isRefetching = false;
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Tab Group Event Handlers - Incremental updates (Chrome 88+ only)
	// ─────────────────────────────────────────────────────────────────────────

	if (browser.tabGroups) {
		// onCreated: Full TabGroup object provided
		browser.tabGroups.onCreated.addListener(async (group) => {
			await initPromise;
			if (syncCoordination.isProcessingYDocChange) return;

			const deviceId = await deviceIdPromise;
			syncCoordination.isRefetching = true;
			tables.tab_groups.upsert(browserTabGroupToRow({ group, deviceId }));
			syncCoordination.isRefetching = false;
		});

		// onRemoved: Full TabGroup object provided
		browser.tabGroups.onRemoved.addListener(async (group) => {
			await initPromise;
			if (syncCoordination.isProcessingYDocChange) return;

			const deviceId = await deviceIdPromise;
			syncCoordination.isRefetching = true;
			tables.tab_groups.delete({
				id: createCompositeId({ deviceId, id: group.id }),
			});
			syncCoordination.isRefetching = false;
		});

		// onUpdated: Full TabGroup object provided
		browser.tabGroups.onUpdated.addListener(async (group) => {
			await initPromise;
			if (syncCoordination.isProcessingYDocChange) return;

			const deviceId = await deviceIdPromise;
			syncCoordination.isRefetching = true;
			tables.tab_groups.upsert(browserTabGroupToRow({ group, deviceId }));
			syncCoordination.isRefetching = false;
		});
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Y.Doc Observers - trigger Browser APIs on upstream changes
	// These handle changes synced from the server (e.g., markdown file deletions)
	// Only process changes for THIS device - other devices manage themselves
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
			if (transaction.origin === null) {
				console.log(
					'[Background] tabs.onAdd SKIPPED: local origin (our own change)',
				);
				return;
			}
			if (result.error) {
				console.log('[Background] tabs.onAdd SKIPPED: result has error');
				return;
			}

			const row = result.data;
			const deviceId = await deviceIdPromise;

			// Only process if this tab is meant for THIS device
			if (row.device_id !== deviceId) {
				console.log(
					'[Background] tabs.onAdd SKIPPED: different device',
					row.device_id,
				);
				return;
			}

			if (!row.url) {
				console.log('[Background] tabs.onAdd SKIPPED: no URL in row');
				return;
			}

			console.log('[Background] tabs.onAdd CREATING tab with URL:', row.url);
			// Set flag to prevent Browser events from triggering refetch
			syncCoordination.isProcessingYDocChange = true;
			await tryAsync({
				try: async () => {
					// Create the tab with the URL from the markdown file
					await browser.tabs.create({ url: row.url });
					console.log(
						'[Background] tabs.onAdd tab created, now refetching...',
					);

					// Refetch to clean up - this will:
					// 1. Add the new Browser tab (with Browser's real ID)
					// 2. Delete the old row (wrong ID from markdown, not in Browser)
					syncCoordination.isRefetching = true;
					await client.refetchTabs();
					syncCoordination.isRefetching = false;
					console.log('[Background] tabs.onAdd refetch complete');
				},
				catch: (error) => {
					console.log(
						`[Background] Failed to create tab from ${row.id}:`,
						error,
					);
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
			if (transaction.origin === null) {
				console.log(
					'[Background] tabs.onDelete SKIPPED: local origin (our own change)',
				);
				return;
			}

			const deviceId = await deviceIdPromise;
			const parsed = parseCompositeId(id);

			// Only close tabs that belong to THIS device
			if (!parsed || parsed.deviceId !== deviceId) {
				console.log(
					'[Background] tabs.onDelete SKIPPED: different device or invalid ID',
				);
				return;
			}

			console.log('[Background] tabs.onDelete REMOVING Browser tab:', parsed.id);
			// Set flag to prevent Browser events from triggering refetch
			syncCoordination.isProcessingYDocChange = true;
			await tryAsync({
				try: async () => {
					await browser.tabs.remove(parsed.id);
					console.log(
						'[Background] tabs.onDelete SUCCESS: removed tab',
						parsed.id,
					);
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

			const deviceId = await deviceIdPromise;

			// Only process if this window is meant for THIS device
			if (result.data.device_id !== deviceId) return;

			syncCoordination.isProcessingYDocChange = true;
			await tryAsync({
				try: async () => {
					// Create a new window
					await browser.windows.create({});

					// Refetch to clean up
					syncCoordination.isRefetching = true;
					await client.refetchWindows();
					syncCoordination.isRefetching = false;
				},
				catch: (error) => {
					console.log(
						`[Background] Failed to create window from ${result.data.id}:`,
						error,
					);
					return Ok(undefined);
				},
			});
			syncCoordination.isProcessingYDocChange = false;
		},
		onDelete: async (id, transaction) => {
			await initPromise;

			// Only process remote changes (from WebSocket sync)
			if (transaction.origin === null) return;

			const deviceId = await deviceIdPromise;
			const parsed = parseCompositeId(id);

			// Only close windows that belong to THIS device
			if (!parsed || parsed.deviceId !== deviceId) return;

			syncCoordination.isProcessingYDocChange = true;
			await tryAsync({
				try: async () => {
					await browser.windows.remove(parsed.id);
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

				const deviceId = await deviceIdPromise;
				const parsed = parseCompositeId(id);

				// Only ungroup tabs from THIS device's groups
				if (!parsed || parsed.deviceId !== deviceId) return;

				syncCoordination.isProcessingYDocChange = true;
				await tryAsync({
					try: async () => {
						// Note: Browser doesn't have tabGroups.remove(), but we can ungroup tabs
						const tabs = await browser.tabs.query({ groupId: parsed.id });
						for (const tab of tabs) {
							if (tab.id !== undefined) {
								await browser.tabs.ungroup(tab.id);
							}
						}
					},
					catch: (error) => {
						console.log(
							`[Background] Failed to ungroup tab group ${id}:`,
							error,
						);
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
