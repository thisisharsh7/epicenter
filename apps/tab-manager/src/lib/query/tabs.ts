import { Err, Ok } from 'wellcrafted/result';
import { epicenter } from '$lib/epicenter';
import { defineMutation, defineQuery, queryClient } from './_client';

/**
 * Query keys for tab-related queries
 */
export const tabsKeys = {
	all: ['tabs'] as const,
	windows: ['windows'] as const,
	byWindow: (windowId: number) => ['tabs', 'window', windowId] as const,
};

/**
 * Tab queries and mutations
 *
 * These use the Epicenter client for browser API calls
 * and TanStack Query for reactive state management.
 */
export const tabs = {
	// ─────────────────────────────────────────────────────────────────────────
	// Queries
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Get all tabs across all windows
	 */
	getAll: defineQuery({
		queryKey: tabsKeys.all,
		resultQueryFn: () => epicenter.client.tabs.getAllTabs({}),
	}),

	/**
	 * Get all windows
	 */
	getAllWindows: defineQuery({
		queryKey: tabsKeys.windows,
		resultQueryFn: () => epicenter.client.tabs.getAllWindows({}),
	}),

	// ─────────────────────────────────────────────────────────────────────────
	// Mutations
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Close a tab
	 */
	close: defineMutation({
		mutationKey: ['tabs', 'close'],
		resultMutationFn: async (tabId: number) => {
			const result = await epicenter.client.tabs.closeTab({ tabId });
			if (result.error) return Err(result.error);

			// Optimistically remove from cache
			queryClient.setQueryData(
				tabsKeys.all,
				(oldTabs: Browser.tabs.Tab[] | undefined) =>
					oldTabs?.filter((t) => t.id !== tabId),
			);

			return Ok(undefined);
		},
	}),

	/**
	 * Activate (focus) a tab
	 */
	activate: defineMutation({
		mutationKey: ['tabs', 'activate'],
		resultMutationFn: async (tabId: number) => {
			const result = await epicenter.client.tabs.activateTab({
				tabId,
			});
			if (result.error) return Err(result.error);

			// Update active state in cache
			queryClient.setQueryData(
				tabsKeys.all,
				(oldTabs: Browser.tabs.Tab[] | undefined) =>
					oldTabs?.map((t) => ({
						...t,
						active:
							t.id === tabId
								? true
								: t.windowId === result.data.windowId
									? false
									: t.active,
					})),
			);

			return Ok(undefined);
		},
	}),

	/**
	 * Pin a tab
	 */
	pin: defineMutation({
		mutationKey: ['tabs', 'pin'],
		resultMutationFn: async (tabId: number) => {
			const result = await epicenter.client.tabs.pinTab({ tabId });
			if (result.error) return Err(result.error);

			// Optimistically update cache
			queryClient.setQueryData(
				tabsKeys.all,
				(oldTabs: Browser.tabs.Tab[] | undefined) =>
					oldTabs?.map((t) => (t.id === tabId ? { ...t, pinned: true } : t)),
			);

			return Ok(undefined);
		},
	}),

	/**
	 * Unpin a tab
	 */
	unpin: defineMutation({
		mutationKey: ['tabs', 'unpin'],
		resultMutationFn: async (tabId: number) => {
			const result = await epicenter.client.tabs.unpinTab({ tabId });
			if (result.error) return Err(result.error);

			queryClient.setQueryData(
				tabsKeys.all,
				(oldTabs: Browser.tabs.Tab[] | undefined) =>
					oldTabs?.map((t) => (t.id === tabId ? { ...t, pinned: false } : t)),
			);

			return Ok(undefined);
		},
	}),

	/**
	 * Mute a tab
	 */
	mute: defineMutation({
		mutationKey: ['tabs', 'mute'],
		resultMutationFn: async (tabId: number) => {
			const result = await epicenter.client.tabs.muteTab({ tabId });
			if (result.error) return Err(result.error);

			queryClient.setQueryData(
				tabsKeys.all,
				(oldTabs: Browser.tabs.Tab[] | undefined) =>
					oldTabs?.map((t) =>
						t.id === tabId
							? { ...t, mutedInfo: { ...t.mutedInfo, muted: true } }
							: t,
					),
			);

			return Ok(undefined);
		},
	}),

	/**
	 * Unmute a tab
	 */
	unmute: defineMutation({
		mutationKey: ['tabs', 'unmute'],
		resultMutationFn: async (tabId: number) => {
			const result = await epicenter.client.tabs.unmuteTab({ tabId });
			if (result.error) return Err(result.error);

			queryClient.setQueryData(
				tabsKeys.all,
				(oldTabs: Browser.tabs.Tab[] | undefined) =>
					oldTabs?.map((t) =>
						t.id === tabId
							? { ...t, mutedInfo: { ...t.mutedInfo, muted: false } }
							: t,
					),
			);

			return Ok(undefined);
		},
	}),

	/**
	 * Reload a tab
	 */
	reload: defineMutation({
		mutationKey: ['tabs', 'reload'],
		resultMutationFn: async (tabId: number) => {
			const result = await epicenter.client.tabs.reloadTab({ tabId });
			if (result.error) return Err(result.error);
			return Ok(undefined);
		},
	}),

	/**
	 * Duplicate a tab
	 */
	duplicate: defineMutation({
		mutationKey: ['tabs', 'duplicate'],
		resultMutationFn: async (tabId: number) => {
			const result = await epicenter.client.tabs.duplicateTab({
				tabId,
			});
			if (result.error) return Err(result.error);

			// Refresh tabs after duplicate
			await queryClient.invalidateQueries({ queryKey: tabsKeys.all });

			return Ok(result.data);
		},
	}),
};
