import { epicenter } from '$lib/epicenter';
import { tabsKeys } from '$lib/epicenter/tabs.workspace';
import { defineMutation, defineQuery } from './_client';

// Re-export keys for convenience
export { tabsKeys };

/**
 * Tab queries and mutations
 *
 * Event-driven architecture: Browser events are the source of truth.
 * The workspace registers listeners that update the query cache when
 * tabs change. Mutations simply call browser APIs - no manual cache
 * updates needed since listeners handle it.
 */
export const tabs = {
	// ─────────────────────────────────────────────────────────────────────────
	// Queries - Initial data fetch; listeners keep cache updated after
	// ─────────────────────────────────────────────────────────────────────────

	getAll: defineQuery({
		queryKey: tabsKeys.all,
		resultQueryFn: () => epicenter.client.tabs.getAllTabs(),
	}),

	getAllWindows: defineQuery({
		queryKey: tabsKeys.windows,
		resultQueryFn: () => epicenter.client.tabs.getAllWindows(),
	}),

	// ─────────────────────────────────────────────────────────────────────────
	// Mutations - Just call browser APIs; listeners handle cache updates
	// ─────────────────────────────────────────────────────────────────────────

	close: defineMutation({
		mutationKey: ['tabs', 'close'],
		resultMutationFn: (tabId: number) =>
			epicenter.client.tabs.closeTab({ tabId }),
	}),

	activate: defineMutation({
		mutationKey: ['tabs', 'activate'],
		resultMutationFn: (tabId: number) =>
			epicenter.client.tabs.activateTab({ tabId }),
	}),

	pin: defineMutation({
		mutationKey: ['tabs', 'pin'],
		resultMutationFn: (tabId: number) =>
			epicenter.client.tabs.pinTab({ tabId }),
	}),

	unpin: defineMutation({
		mutationKey: ['tabs', 'unpin'],
		resultMutationFn: (tabId: number) =>
			epicenter.client.tabs.unpinTab({ tabId }),
	}),

	mute: defineMutation({
		mutationKey: ['tabs', 'mute'],
		resultMutationFn: (tabId: number) =>
			epicenter.client.tabs.muteTab({ tabId }),
	}),

	unmute: defineMutation({
		mutationKey: ['tabs', 'unmute'],
		resultMutationFn: (tabId: number) =>
			epicenter.client.tabs.unmuteTab({ tabId }),
	}),

	reload: defineMutation({
		mutationKey: ['tabs', 'reload'],
		resultMutationFn: (tabId: number) =>
			epicenter.client.tabs.reloadTab({ tabId }),
	}),

	duplicate: defineMutation({
		mutationKey: ['tabs', 'duplicate'],
		resultMutationFn: (tabId: number) =>
			epicenter.client.tabs.duplicateTab({ tabId }),
	}),
};
