/**
 * TanStack Query integration for tabs.
 *
 * Queries read directly from Chrome APIs - Chrome is the source of truth.
 * Chrome events (subscribed via chrome-events.ts) invalidate queries for live updates.
 * Mutations call Chrome APIs directly; changes propagate via Chrome events.
 */

import {
	browserTabToRow,
	browserWindowToRow,
	browserTabGroupToRow,
} from '$lib/browser-helpers';
import { getDeviceId } from '$lib/device-id';

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
// Query and Mutation Definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tab queries and mutations.
 *
 * Queries hit Chrome APIs directly - no Y.Doc intermediary.
 * Chrome events invalidate queries for live updates.
 * Mutations call Chrome APIs directly; changes propagate via Chrome events.
 */
export const tabs = {
	// ─────────────────────────────────────────────────────────────────────────
	// Queries - Read directly from Chrome APIs
	// ─────────────────────────────────────────────────────────────────────────

	getAll: {
		options: {
			queryKey: tabsKeys.all,
			queryFn: async () => {
				const deviceId = await getDeviceId();
				const browserTabs = await browser.tabs.query({});
				return browserTabs
					.filter((t) => t.id !== undefined)
					.map((tab) => browserTabToRow({ tab, deviceId }))
					.sort((a, b) => a.index - b.index);
			},
			// Browser is always fresh. Data is only stale when browser events tell us.
			// Using Infinity means we only refetch on explicit invalidation.
			staleTime: Infinity,
		},
	},

	getAllWindows: {
		options: {
			queryKey: tabsKeys.windows,
			queryFn: async () => {
				const deviceId = await getDeviceId();
				const browserWindows = await browser.windows.getAll();
				return browserWindows
					.filter((w) => w.id !== undefined)
					.map((window) => browserWindowToRow({ window, deviceId }));
			},
			staleTime: Infinity,
		},
	},

	getAllTabGroups: {
		options: {
			queryKey: tabsKeys.tabGroups,
			queryFn: async () => {
				// Tab groups are Chrome 88+ only
				if (!browser.tabGroups) {
					return [];
				}
				const deviceId = await getDeviceId();
				const browserGroups = await browser.tabGroups.query({});
				return browserGroups.map((group) =>
					browserTabGroupToRow({ group, deviceId }),
				);
			},
			staleTime: Infinity,
		},
	},

	// ─────────────────────────────────────────────────────────────────────────
	// Mutations - Call Chrome APIs directly
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
