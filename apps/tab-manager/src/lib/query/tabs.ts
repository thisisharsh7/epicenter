/**
 * TanStack Query integration for tabs.
 *
 * Queries read from the Y.Doc replica and subscribe to changes.
 * Mutations call Chrome APIs directly - the background service worker
 * picks up the Chrome events and updates the Y.Doc, which propagates
 * back to the popup via chrome.runtime.connect.
 */

import { epicenter } from '$lib/epicenter';
import { queryClient } from './_client';

// ─────────────────────────────────────────────────────────────────────────────
// Query Keys
// ─────────────────────────────────────────────────────────────────────────────

export const tabsKeys = {
	all: ['tabs'] as const,
	windows: ['windows'] as const,
	tabGroups: ['tabGroups'] as const,
	byWindow: (windowId: string) => ['tabs', 'window', windowId] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Y.Doc Subscription
// ─────────────────────────────────────────────────────────────────────────────

let unsubscribeTabs: (() => void) | null = null;
let unsubscribeWindows: (() => void) | null = null;
let unsubscribeTabGroups: (() => void) | null = null;

/**
 * Create an observe callback that invalidates queries on any change.
 */
function createInvalidator(queryKey: readonly unknown[]) {
	const invalidate = () => queryClient.invalidateQueries({ queryKey });
	return {
		onAdd: invalidate,
		onUpdate: invalidate,
		onDelete: invalidate,
	};
}

/**
 * Subscribe to Y.Doc changes and invalidate TanStack Query cache.
 *
 * Call this once after EpicenterProvider has initialized.
 */
export function subscribeToYDocChanges() {
	// Unsubscribe from previous subscriptions
	unsubscribeFromYDocChanges();

	// Subscribe to tabs changes
	unsubscribeTabs = epicenter.tables.tabs.observe(createInvalidator(tabsKeys.all));

	// Subscribe to windows changes
	unsubscribeWindows = epicenter.tables.windows.observe(
		createInvalidator(tabsKeys.windows),
	);

	// Subscribe to tab groups changes
	unsubscribeTabGroups = epicenter.tables.tab_groups.observe(
		createInvalidator(tabsKeys.tabGroups),
	);

	console.log('[Query] Subscribed to Y.Doc changes');
}

/**
 * Unsubscribe from Y.Doc changes.
 */
export function unsubscribeFromYDocChanges() {
	if (unsubscribeTabs) {
		unsubscribeTabs();
		unsubscribeTabs = null;
	}
	if (unsubscribeWindows) {
		unsubscribeWindows();
		unsubscribeWindows = null;
	}
	if (unsubscribeTabGroups) {
		unsubscribeTabGroups();
		unsubscribeTabGroups = null;
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Query and Mutation Definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tab queries and mutations.
 *
 * Uses the `.options` pattern for compatibility with createQuery/createMutation.
 * Mutations call Chrome APIs directly; Chrome events update Y.Doc in background,
 * which propagates to popup and invalidates queries.
 */
export const tabs = {
	// ─────────────────────────────────────────────────────────────────────────
	// Queries
	// ─────────────────────────────────────────────────────────────────────────

	getAll: {
		options: {
			queryKey: tabsKeys.all,
			queryFn: () => epicenter.getAllTabs(),
			staleTime: Infinity,
		},
	},

	getAllWindows: {
		options: {
			queryKey: tabsKeys.windows,
			queryFn: () => epicenter.getAllWindows(),
			staleTime: Infinity,
		},
	},

	getAllTabGroups: {
		options: {
			queryKey: tabsKeys.tabGroups,
			queryFn: () => epicenter.tables.tab_groups.getAllValid(),
			staleTime: Infinity,
		},
	},

	// ─────────────────────────────────────────────────────────────────────────
	// Mutations
	// ─────────────────────────────────────────────────────────────────────────

	close: {
		options: {
			mutationKey: ['tabs', 'close'],
			mutationFn: async (tabId: number) => {
				await browser.tabs.remove(tabId);
			},
		},
	},

	activate: {
		options: {
			mutationKey: ['tabs', 'activate'],
			mutationFn: async (tabId: number) => {
				const tab = await browser.tabs.update(tabId, { active: true });
				if (tab?.windowId) {
					await browser.windows.update(tab.windowId, { focused: true });
				}
				return tab;
			},
		},
	},

	pin: {
		options: {
			mutationKey: ['tabs', 'pin'],
			mutationFn: async (tabId: number) => {
				return browser.tabs.update(tabId, { pinned: true });
			},
		},
	},

	unpin: {
		options: {
			mutationKey: ['tabs', 'unpin'],
			mutationFn: async (tabId: number) => {
				return browser.tabs.update(tabId, { pinned: false });
			},
		},
	},

	mute: {
		options: {
			mutationKey: ['tabs', 'mute'],
			mutationFn: async (tabId: number) => {
				return browser.tabs.update(tabId, { muted: true });
			},
		},
	},

	unmute: {
		options: {
			mutationKey: ['tabs', 'unmute'],
			mutationFn: async (tabId: number) => {
				return browser.tabs.update(tabId, { muted: false });
			},
		},
	},

	reload: {
		options: {
			mutationKey: ['tabs', 'reload'],
			mutationFn: async (tabId: number) => {
				await browser.tabs.reload(tabId);
			},
		},
	},

	duplicate: {
		options: {
			mutationKey: ['tabs', 'duplicate'],
			mutationFn: async (tabId: number) => {
				return browser.tabs.duplicate(tabId);
			},
		},
	},
};

