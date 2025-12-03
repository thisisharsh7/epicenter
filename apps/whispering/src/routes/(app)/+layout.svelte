<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { listen, type UnlistenFn } from '@tauri-apps/api/event';
	import { rpc } from '$lib/query';
	import * as services from '$lib/services';
	import * as Sidebar from '@repo/ui/sidebar';
	import AppLayout from './_components/AppLayout.svelte';
	import VerticalNav from './_components/VerticalNav.svelte';

	let { children } = $props();

	let unlistenNavigate: UnlistenFn | null = null;

	$effect(() => {
		const unlisten = services.localShortcutManager.listen();
		return () => unlisten();
	});

	// Log app started event once on mount
	$effect(() => {
		rpc.analytics.logEvent.execute({ type: 'app_started' });
	});

	// Listen for navigation events from other windows
	onMount(async () => {
		unlistenNavigate = await listen<{ path: string }>(
			'navigate-main-window',
			(event) => {
				goto(event.payload.path);
			},
		);
	});

	onDestroy(() => {
		unlistenNavigate?.();
	});
</script>

<Sidebar.Provider>
	<VerticalNav />
	<Sidebar.Inset>
		<!-- Trigger button for mobile (always visible - opens Sheet) -->
		<div class="fixed left-2 top-2 z-40 md:hidden">
			<Sidebar.Trigger />
		</div>
		<AppLayout>
			{@render children()}
		</AppLayout>
	</Sidebar.Inset>
</Sidebar.Provider>
