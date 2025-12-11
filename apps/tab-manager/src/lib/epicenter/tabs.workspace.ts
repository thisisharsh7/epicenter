import { defineMutation, defineQuery, defineWorkspace } from '@epicenter/hq';
import { type } from 'arktype';
import { Err, Ok, tryAsync } from 'wellcrafted/result';
import { queryClient } from '$lib/query/_client';

/**
 * Query keys for tab state
 * Centralized here since listeners and queries both need them
 */
export const tabsKeys = {
	all: ['tabs'] as const,
	windows: ['windows'] as const,
};

/**
 * Tabs workspace
 *
 * Event-driven architecture: Browser events are the source of truth.
 * Listeners registered in the exports closure update the query cache
 * when tabs change. Mutations simply call browser APIs and let the
 * listeners handle state updates.
 *
 * Flow:
 *   User action → mutation → browser API → browser event → listener → cache update → UI
 */
export const tabsWorkspace = defineWorkspace({
	id: 'tabs',

	// No persistent tables - tabs are ephemeral browser state
	tables: {},

	// No persistence providers - browser manages tab state
	providers: {},

	exports: () => {
		// ═══════════════════════════════════════════════════════════════════════════
		// EVENT LISTENERS - Source of truth for state updates
		// ═══════════════════════════════════════════════════════════════════════════

		/**
		 * Helper: Rebuild entire tabs state from browser
		 * Used by listeners that need full state (simpler than surgical updates)
		 */
		async function syncAllTabs() {
			const tabs = await browser.tabs.query({});
			queryClient.setQueryData(tabsKeys.all, tabs);
		}

		/**
		 * Helper: Rebuild windows state from browser
		 */
		async function syncAllWindows() {
			const windows = await browser.windows.getAll({ populate: true });
			queryClient.setQueryData(tabsKeys.windows, windows);
		}

		// Tab created - add to cache
		browser.tabs.onCreated.addListener((tab) => {
			queryClient.setQueryData(
				tabsKeys.all,
				(oldTabs: Browser.tabs.Tab[] | undefined) =>
					oldTabs ? [...oldTabs, tab] : [tab],
			);
			// Also update windows since tab counts changed
			syncAllWindows();
		});

		// Tab removed - remove from cache
		browser.tabs.onRemoved.addListener((tabId) => {
			queryClient.setQueryData(
				tabsKeys.all,
				(oldTabs: Browser.tabs.Tab[] | undefined) =>
					oldTabs?.filter((t) => t.id !== tabId) ?? [],
			);
			// Also update windows since tab counts changed
			syncAllWindows();
		});

		// Tab updated (URL, title, pinned, muted, etc.) - update in cache
		browser.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) => {
			queryClient.setQueryData(
				tabsKeys.all,
				(oldTabs: Browser.tabs.Tab[] | undefined) =>
					oldTabs?.map((t) => (t.id === tab.id ? tab : t)) ?? [],
			);
		});

		// Tab activated (user switched tabs) - update active state
		browser.tabs.onActivated.addListener(({ tabId, windowId }) => {
			queryClient.setQueryData(
				tabsKeys.all,
				(oldTabs: Browser.tabs.Tab[] | undefined) =>
					oldTabs?.map((t) => ({
						...t,
						active:
							t.id === tabId
								? true
								: t.windowId === windowId
									? false
									: t.active,
					})) ?? [],
			);
		});

		// Tab moved within window - rebuild to get correct order
		browser.tabs.onMoved.addListener(() => {
			syncAllTabs();
		});

		// Tab attached to window (moved between windows)
		browser.tabs.onAttached.addListener(() => {
			syncAllTabs();
			syncAllWindows();
		});

		// Tab detached from window
		browser.tabs.onDetached.addListener(() => {
			syncAllTabs();
			syncAllWindows();
		});

		// ═══════════════════════════════════════════════════════════════════════════
		// QUERIES - Initial data fetch
		// ═══════════════════════════════════════════════════════════════════════════

		return {
			/**
			 * Get all tabs across all windows
			 * Used for initial fetch; listeners keep it updated after that
			 */
			getAllTabs: defineQuery({
				handler: async () => {
					return tryAsync({
						try: () => browser.tabs.query({}),
						catch: (error) =>
							Err({
								name: 'TabsQueryError' as const,
								message: 'Failed to query tabs',
								cause: error,
							}),
					});
				},
			}),

			/**
			 * Get all windows with their tabs
			 */
			getAllWindows: defineQuery({
				handler: async () => {
					return tryAsync({
						try: () => browser.windows.getAll({ populate: true }),
						catch: (error) =>
							Err({
								name: 'WindowsQueryError' as const,
								message: 'Failed to query windows',
								cause: error,
							}),
					});
				},
			}),

			// ═══════════════════════════════════════════════════════════════════════════
			// MUTATIONS - Thin wrappers that call browser APIs
			// State updates happen via event listeners, not here
			// ═══════════════════════════════════════════════════════════════════════════

			/**
			 * Close a tab
			 * Browser fires onRemoved → listener updates cache
			 */
			closeTab: defineMutation({
				input: type({ tabId: 'number' }),
				handler: async ({ tabId }) => {
					return tryAsync({
						try: async () => {
							await browser.tabs.remove(tabId);
							return undefined;
						},
						catch: (error) =>
							Err({
								name: 'TabCloseError' as const,
								message: 'Failed to close tab',
								cause: error,
							}),
					});
				},
			}),

			/**
			 * Activate (focus) a tab and its window
			 * Browser fires onActivated → listener updates cache
			 */
			activateTab: defineMutation({
				input: type({ tabId: 'number' }),
				handler: async ({ tabId }) => {
					return tryAsync({
						try: async () => {
							const tab = await browser.tabs.update(tabId, { active: true });
							if (!tab) throw new Error('Tab not found');
							if (tab.windowId) {
								await browser.windows.update(tab.windowId, { focused: true });
							}
							return tab;
						},
						catch: (error) =>
							Err({
								name: 'TabActivateError' as const,
								message: 'Failed to activate tab',
								cause: error,
							}),
					});
				},
			}),

			/**
			 * Pin a tab
			 * Browser fires onUpdated with pinned change → listener updates cache
			 */
			pinTab: defineMutation({
				input: type({ tabId: 'number' }),
				handler: async ({ tabId }) => {
					return tryAsync({
						try: async () => {
							const tab = await browser.tabs.update(tabId, { pinned: true });
							if (!tab) throw new Error('Tab not found');
							return tab;
						},
						catch: (error) =>
							Err({
								name: 'TabPinError' as const,
								message: 'Failed to pin tab',
								cause: error,
							}),
					});
				},
			}),

			/**
			 * Unpin a tab
			 * Browser fires onUpdated → listener updates cache
			 */
			unpinTab: defineMutation({
				input: type({ tabId: 'number' }),
				handler: async ({ tabId }) => {
					return tryAsync({
						try: async () => {
							const tab = await browser.tabs.update(tabId, { pinned: false });
							if (!tab) throw new Error('Tab not found');
							return tab;
						},
						catch: (error) =>
							Err({
								name: 'TabUnpinError' as const,
								message: 'Failed to unpin tab',
								cause: error,
							}),
					});
				},
			}),

			/**
			 * Mute a tab
			 * Browser fires onUpdated with mutedInfo change → listener updates cache
			 */
			muteTab: defineMutation({
				input: type({ tabId: 'number' }),
				handler: async ({ tabId }) => {
					return tryAsync({
						try: async () => {
							const tab = await browser.tabs.update(tabId, { muted: true });
							if (!tab) throw new Error('Tab not found');
							return tab;
						},
						catch: (error) =>
							Err({
								name: 'TabMuteError' as const,
								message: 'Failed to mute tab',
								cause: error,
							}),
					});
				},
			}),

			/**
			 * Unmute a tab
			 * Browser fires onUpdated → listener updates cache
			 */
			unmuteTab: defineMutation({
				input: type({ tabId: 'number' }),
				handler: async ({ tabId }) => {
					return tryAsync({
						try: async () => {
							const tab = await browser.tabs.update(tabId, { muted: false });
							if (!tab) throw new Error('Tab not found');
							return tab;
						},
						catch: (error) =>
							Err({
								name: 'TabUnmuteError' as const,
								message: 'Failed to unmute tab',
								cause: error,
							}),
					});
				},
			}),

			/**
			 * Reload a tab
			 * Browser fires onUpdated (status: loading → complete) → listener updates cache
			 */
			reloadTab: defineMutation({
				input: type({ tabId: 'number' }),
				handler: async ({ tabId }) => {
					return tryAsync({
						try: async () => {
							await browser.tabs.reload(tabId);
							return undefined;
						},
						catch: (error) =>
							Err({
								name: 'TabReloadError' as const,
								message: 'Failed to reload tab',
								cause: error,
							}),
					});
				},
			}),

			/**
			 * Duplicate a tab
			 * Browser fires onCreated → listener updates cache
			 */
			duplicateTab: defineMutation({
				input: type({ tabId: 'number' }),
				handler: async ({ tabId }) => {
					return tryAsync({
						try: () => browser.tabs.duplicate(tabId),
						catch: (error) =>
							Err({
								name: 'TabDuplicateError' as const,
								message: 'Failed to duplicate tab',
								cause: error,
							}),
					});
				},
			}),
		};
	},
});
