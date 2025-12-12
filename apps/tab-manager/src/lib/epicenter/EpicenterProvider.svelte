<script module lang="ts">
	import * as Y from 'yjs';
	import { connectToBackground } from '$lib/sync/background-sync';
	import type { Tab, Window, TabGroup } from './browser.schema';

	// The Y.Doc and tables - set during initialization
	let ydoc: Y.Doc | null = null;
	let disconnect: (() => void) | null = null;

	// Table accessors
	function getTablesMap(): Y.Map<Y.Map<Y.Map<unknown>>> {
		if (!ydoc) throw new Error('Y.Doc not initialized');
		return ydoc.getMap('tables') as Y.Map<Y.Map<Y.Map<unknown>>>;
	}

	function getTable<T>(
		name: string,
	): { getAll: () => T[]; observe: (callback: () => void) => () => void } {
		const tables = getTablesMap();
		if (!tables.has(name)) {
			tables.set(name, new Y.Map() as Y.Map<Y.Map<unknown>>);
		}
		const table = tables.get(name) as Y.Map<Y.Map<unknown>>;

		return {
			getAll(): T[] {
				const rows: T[] = [];
				for (const row of table.values()) {
					const obj: Record<string, unknown> = {};
					for (const [key, value] of row.entries()) {
						obj[key] = value;
					}
					rows.push(obj as T);
				}
				return rows;
			},
			observe(callback: () => void): () => void {
				table.observeDeep(callback);
				return () => table.unobserveDeep(callback);
			},
		};
	}

	async function init(): Promise<void> {
		// Create Y.Doc and connect to background
		ydoc = new Y.Doc({ guid: 'browser' });
		disconnect = connectToBackground(ydoc);
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

		get tabs() {
			return getTable<Tab>('tabs');
		},

		get windows() {
			return getTable<Window>('windows');
		},

		get tabGroups() {
			return getTable<TabGroup>('tabGroups');
		},

		/**
		 * Get all tabs sorted by index.
		 */
		getAllTabs(): Tab[] {
			return this.tabs.getAll().sort((a, b) => a.index - b.index);
		},

		/**
		 * Get all windows.
		 */
		getAllWindows(): Window[] {
			return this.windows.getAll();
		},

		/**
		 * Get tabs for a specific window.
		 */
		getTabsByWindow(windowId: string): Tab[] {
			return this.tabs
				.getAll()
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
