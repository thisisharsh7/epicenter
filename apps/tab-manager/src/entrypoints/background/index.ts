/**
 * Background service worker for Tab Manager.
 *
 * This is the hub of the extension:
 * 1. Holds the authoritative Y.Doc
 * 2. Syncs Chrome → Y.Doc (Chrome is source of truth)
 * 3. Syncs Y.Doc ↔ Server via WebSocket
 *
 * Source of truth: Chrome tab API (always)
 *
 * Note: No persistence needed. Tab data is ephemeral - Chrome is always
 * the source of truth, and tab IDs change on browser restart.
 *
 * Sync strategy:
 * - `refetchTabs()` / `refetchWindows()` / `refetchTabGroups()`: Diff Chrome state into Y.Doc
 * - Chrome events trigger these refetch functions to keep Y.Doc in sync
 * - Like TanStack Query's invalidateQueries, but for Y.Doc
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
	// ─────────────────────────────────────────────────────────────────────────

	// Tab events → refetch tabs
	browser.tabs.onCreated.addListener(() => client.refetchTabs());
	browser.tabs.onRemoved.addListener(() => client.refetchTabs());
	browser.tabs.onUpdated.addListener(() => client.refetchTabs());
	browser.tabs.onMoved.addListener(() => client.refetchTabs());
	browser.tabs.onActivated.addListener(() => client.refetchTabs());
	browser.tabs.onAttached.addListener(() => client.refetchTabs());
	browser.tabs.onDetached.addListener(() => client.refetchTabs());

	// Window events → refetch windows
	browser.windows.onCreated.addListener(() => client.refetchWindows());
	browser.windows.onRemoved.addListener(() => client.refetchWindows());
	browser.windows.onFocusChanged.addListener(() => client.refetchWindows());

	// Tab group events → refetch tab groups (Chrome 88+ only)
	if (browser.tabGroups) {
		browser.tabGroups.onCreated.addListener(() => client.refetchTabGroups());
		browser.tabGroups.onRemoved.addListener(() => client.refetchTabGroups());
		browser.tabGroups.onUpdated.addListener(() => client.refetchTabGroups());
	}

	console.log('[Background] Tab Manager initialized', {
		tabs: client.getAllTabs().length,
		windows: client.getAllWindows().length,
	});
});
