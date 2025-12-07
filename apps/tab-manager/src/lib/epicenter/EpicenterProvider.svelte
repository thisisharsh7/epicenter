<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { initEpicenterClient } from './index';

	let { children }: { children: Snippet } = $props();
	let ready = $state(false);

	onMount(async () => {
		await initEpicenterClient();
		ready = true;
	});
</script>

{#if ready}
	{@render children()}
{/if}
