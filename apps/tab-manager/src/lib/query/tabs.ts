import { Err, Ok, tryAsync } from 'wellcrafted/result';
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
 * These wrap the browser.tabs API with TanStack Query
 * for reactive state management in Svelte components.
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
		resultQueryFn: async () => {
			const result = await tryAsync({
				try: () => browser.tabs.query({}),
				catch: (error) =>
					Err({
						_tag: 'TabsQueryError' as const,
						message: 'Failed to query tabs',
						cause: error,
					}),
			});
			return result;
		},
	}),

	/**
	 * Get all windows
	 */
	getAllWindows: defineQuery({
		queryKey: tabsKeys.windows,
		resultQueryFn: async () => {
			const result = await tryAsync({
				try: () => browser.windows.getAll({ populate: true }),
				catch: (error) =>
					Err({
						_tag: 'WindowsQueryError' as const,
						message: 'Failed to query windows',
						cause: error,
					}),
			});
			return result;
		},
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
			const result = await tryAsync({
				try: () => browser.tabs.remove(tabId),
				catch: (error) =>
					Err({
						_tag: 'TabCloseError' as const,
						message: 'Failed to close tab',
						cause: error,
					}),
			});
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
			const result = await tryAsync({
				try: async () => {
					const tab = await browser.tabs.update(tabId, { active: true });
					// Also focus the window
					if (tab.windowId) {
						await browser.windows.update(tab.windowId, { focused: true });
					}
					return tab;
				},
				catch: (error) =>
					Err({
						_tag: 'TabActivateError' as const,
						message: 'Failed to activate tab',
						cause: error,
					}),
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
			const result = await tryAsync({
				try: () => browser.tabs.update(tabId, { pinned: true }),
				catch: (error) =>
					Err({
						_tag: 'TabPinError' as const,
						message: 'Failed to pin tab',
						cause: error,
					}),
			});
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
			const result = await tryAsync({
				try: () => browser.tabs.update(tabId, { pinned: false }),
				catch: (error) =>
					Err({
						_tag: 'TabUnpinError' as const,
						message: 'Failed to unpin tab',
						cause: error,
					}),
			});
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
			const result = await tryAsync({
				try: () => browser.tabs.update(tabId, { muted: true }),
				catch: (error) =>
					Err({
						_tag: 'TabMuteError' as const,
						message: 'Failed to mute tab',
						cause: error,
					}),
			});
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
			const result = await tryAsync({
				try: () => browser.tabs.update(tabId, { muted: false }),
				catch: (error) =>
					Err({
						_tag: 'TabUnmuteError' as const,
						message: 'Failed to unmute tab',
						cause: error,
					}),
			});
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
			const result = await tryAsync({
				try: () => browser.tabs.reload(tabId),
				catch: (error) =>
					Err({
						_tag: 'TabReloadError' as const,
						message: 'Failed to reload tab',
						cause: error,
					}),
			});
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
			const result = await tryAsync({
				try: () => browser.tabs.duplicate(tabId),
				catch: (error) =>
					Err({
						_tag: 'TabDuplicateError' as const,
						message: 'Failed to duplicate tab',
						cause: error,
					}),
			});
			if (result.error) return Err(result.error);

			// Refresh tabs after duplicate
			await queryClient.invalidateQueries({ queryKey: tabsKeys.all });

			return Ok(result.data);
		},
	}),
};
