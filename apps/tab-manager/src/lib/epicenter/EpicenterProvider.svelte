<!--
	ChromeEventsProvider - Chrome event subscription for live UI updates.

	Subscribes to Chrome browser events on mount and invalidates TanStack Query
	cache when tabs/windows change. No Y.Doc sync needed - Chrome is the source
	of truth, and queries read directly from Chrome APIs.

	The popup renders immediately - no waiting for background sync.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount, onDestroy } from 'svelte';
	import { subscribeToChromeBrowserEvents } from '$lib/chrome-events';

	let { children }: { children: Snippet } = $props();

	let unsubscribe: (() => void) | null = null;

	onMount(() => {
		unsubscribe = subscribeToChromeBrowserEvents();
	});

	onDestroy(() => {
		unsubscribe?.();
	});
</script>

{@render children()}
