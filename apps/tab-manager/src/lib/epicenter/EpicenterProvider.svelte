<!--
	EpicenterProvider - Epicenter client sync and lifecycle management.

	Wraps children and handles:
	- Waiting for epicenter.whenSynced before rendering children
	- Subscribing to Y.Doc changes on mount (for TanStack Query cache invalidation)
	- Unsubscribing and cleanup on destroy

	The epicenter client is created synchronously in client.ts (browser pattern),
	but providers like IndexedDB persistence load data asynchronously.
	This component waits for that sync to complete before rendering the app.

	@see docs/articles/sync-client-initialization.md
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount, onDestroy } from 'svelte';
	import { epicenter } from './client';
	import {
		subscribeToYDocChanges,
		unsubscribeFromYDocChanges,
	} from '$lib/query/tabs';

	let { children }: { children: Snippet } = $props();

	onMount(() => {
		subscribeToYDocChanges();
	});

	onDestroy(() => {
		unsubscribeFromYDocChanges();
		epicenter.destroy();
	});
</script>

{#await epicenter.whenSynced}
	<!-- Loading state while IndexedDB syncs -->
{:then}
	{@render children()}
{/await}
