<!--
	EpicenterProvider - Y.Doc subscription lifecycle management.

	Wraps children and handles:
	- Subscribing to Y.Doc changes on mount (for TanStack Query cache invalidation)
	- Unsubscribing and cleanup on destroy

	The epicenter client itself is created in client.ts and can be imported directly.
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

{@render children()}
