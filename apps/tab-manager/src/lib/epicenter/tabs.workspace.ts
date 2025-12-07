import { defineMutation, defineQuery, defineWorkspace } from '@epicenter/hq';
import { type } from 'arktype';
import { Err, Ok, tryAsync } from 'wellcrafted/result';

/**
 * Tabs workspace
 *
 * Manages browser tabs and windows via the browser extension API.
 * Uses defineQuery/defineMutation pattern for type-safe operations.
 *
 * Note: This workspace has no persistent schema (empty schema object)
 * because tabs are ephemeral browser state, not user data to persist.
 */
export const tabsWorkspace = defineWorkspace({
	id: 'tabs',

	// No persistent schema - tabs are ephemeral browser state
	schema: {},

	// No indexes needed for ephemeral data
	indexes: {},

	// No persistence providers - browser manages tab state
	providers: [],

	exports: () => ({
		// ═══════════════════════════════════════════════════════════════════════════
		// QUERIES
		// ═══════════════════════════════════════════════════════════════════════════

		/**
		 * Get all tabs across all windows
		 */
		getAllTabs: defineQuery({
			input: type({}),
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
			input: type({}),
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
		// MUTATIONS
		// ═══════════════════════════════════════════════════════════════════════════

		/**
		 * Close a tab
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
		 */
		activateTab: defineMutation({
			input: type({ tabId: 'number' }),
			handler: async ({ tabId }) => {
				return tryAsync({
					try: async () => {
						const tab = await browser.tabs.update(tabId, { active: true });
						if (!tab) {
							throw new Error('Tab not found');
						}
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
		 */
		pinTab: defineMutation({
			input: type({ tabId: 'number' }),
			handler: async ({ tabId }) => {
				return tryAsync({
					try: async () => {
						const tab = await browser.tabs.update(tabId, { pinned: true });
						if (!tab) {
							throw new Error('Tab not found');
						}
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
		 */
		unpinTab: defineMutation({
			input: type({ tabId: 'number' }),
			handler: async ({ tabId }) => {
				return tryAsync({
					try: async () => {
						const tab = await browser.tabs.update(tabId, { pinned: false });
						if (!tab) {
							throw new Error('Tab not found');
						}
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
		 */
		muteTab: defineMutation({
			input: type({ tabId: 'number' }),
			handler: async ({ tabId }) => {
				return tryAsync({
					try: async () => {
						const tab = await browser.tabs.update(tabId, { muted: true });
						if (!tab) {
							throw new Error('Tab not found');
						}
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
		 */
		unmuteTab: defineMutation({
			input: type({ tabId: 'number' }),
			handler: async ({ tabId }) => {
				return tryAsync({
					try: async () => {
						const tab = await browser.tabs.update(tabId, { muted: false });
						if (!tab) {
							throw new Error('Tab not found');
						}
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
	}),
});
