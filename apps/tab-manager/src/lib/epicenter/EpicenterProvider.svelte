<script module lang="ts">
	import { createEpicenterDb } from '@epicenter/hq';
	import * as Y from 'yjs';
	import { connectToBackground } from '$lib/sync/background-sync';
	import type { Tab, Window } from './browser.schema';
	import { BROWSER_SCHEMA, type BrowserDb } from './browser-db';

	// The Y.Doc and database - set during initialization
	let ydoc: Y.Doc | null = null;
	let db: BrowserDb | null = null;
	let disconnect: (() => void) | null = null;

	async function init(): Promise<void> {
		// Create Y.Doc, connect to background, and wrap with typed helpers
		ydoc = new Y.Doc({ guid: 'browser' });
		disconnect = connectToBackground(ydoc);
		db = createEpicenterDb(ydoc, BROWSER_SCHEMA);
	}

	function destroy(): void {
		if (disconnect) {
			disconnect();
			disconnect = null;
		}
		if (ydoc) {
			ydoc.destroy();
			ydoc = null;
		}
		db = null;
	}

	/**
	 * Epicenter client for the popup.
	 *
	 * Provides access to Y.Doc tables with TanStack Query integration.
	 */
	export const epicenter = {
		get ydoc(): Y.Doc {
			if (!ydoc) {
				throw new Error(
					'Epicenter not initialized. Wrap your app in EpicenterProvider.',
				);
			}
			return ydoc;
		},

		get db(): BrowserDb {
			if (!db) {
				throw new Error(
					'Epicenter not initialized. Wrap your app in EpicenterProvider.',
				);
			}
			return db;
		},

		/**
		 * Get all tabs sorted by index.
		 */
		getAllTabs(): Tab[] {
			return this.db.tabs.getAllValid().sort((a, b) => a.index - b.index);
		},

		/**
		 * Get all windows.
		 */
		getAllWindows(): Window[] {
			return this.db.windows.getAllValid();
		},

		/**
		 * Get tabs for a specific window.
		 */
		getTabsByWindow(windowId: string): Tab[] {
			return this.db.tabs
				.filter((t) => t.window_id === windowId)
				.sort((a, b) => a.index - b.index);
		},
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
	let ready = $state(false);

	onMount(async () => {
		await init();
		// Subscribe to Y.Doc changes to invalidate TanStack Query cache
		subscribeToYDocChanges();
		ready = true;
	});

	onDestroy(() => {
		unsubscribeFromYDocChanges();
		destroy();
	});
</script>

{#if ready}
	{@render children()}
{/if}
