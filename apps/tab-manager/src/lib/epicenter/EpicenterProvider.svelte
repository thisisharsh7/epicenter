<script module lang="ts">
	import { createWorkspaceClient, type WorkspaceClient } from '@epicenter/hq';
	import { browserWorkspace } from './browser.workspace';

	// Create the workspace client synchronously on module load
	// Browser initialization is synchronous - no await needed
	const client = createWorkspaceClient(browserWorkspace);

	/**
	 * Epicenter client for the popup.
	 *
	 * Provides access to workspace exports with TanStack Query integration.
	 * This is a thin wrapper over the workspace client exports.
	 */
	export const epicenter = {
		/**
		 * Direct access to the underlying Y.Doc.
		 */
		get $ydoc() {
			return client.$ydoc;
		},

		/**
		 * Direct access to the tables for observe/invalidation.
		 */
		get db() {
			return client.tables;
		},

		/**
		 * Get all tabs sorted by index.
		 */
		getAllTabs: client.getAllTabs.bind(client),

		/**
		 * Get all windows.
		 */
		getAllWindows: client.getAllWindows.bind(client),

		/**
		 * Get tabs for a specific window.
		 */
		getTabsByWindow: client.getTabsByWindow.bind(client),

		/**
		 * Clean up resources.
		 */
		destroy: client.destroy,
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount, onDestroy } from 'svelte';
	import {
		subscribeToYDocChanges,
		unsubscribeFromYDocChanges,
	} from '$lib/query/tabs';

	let { children }: { children: Snippet } = $props();

	onMount(() => {
		// Subscribe to Y.Doc changes to invalidate TanStack Query cache
		subscribeToYDocChanges();
	});

	onDestroy(() => {
		unsubscribeFromYDocChanges();
		epicenter.destroy();
	});
</script>

{@render children()}
