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
		// NOTE: We do NOT call epicenter.destroy() here!
		// The epicenter client is a module-level singleton that persists
		// across component remounts. Destroying it would make subsequent
		// reads return empty data.
	});
</script>

{#await epicenter.whenSynced}
	<!-- Loading state while background syncs -->
	<div class="p-4 text-center text-muted-foreground">
		<p>Waiting for sync with background...</p>
	</div>
{:then}
	{@render children()}
{/await}
