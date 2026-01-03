<script lang="ts">
	import { queryClient } from '$lib/query';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { ModeWatcher, mode } from 'mode-watcher';
	import { Toaster, type ToasterProps } from 'svelte-sonner';
	import '@epicenter/ui/app.css';
	import * as Sidebar from '@epicenter/ui/sidebar';
	import AppSidebar from '$lib/components/app-sidebar.svelte';

	let { children } = $props();

	const TOASTER_SETTINGS = {
		position: 'bottom-right',
		richColors: true,
		duration: 5000,
		visibleToasts: 5,
		closeButton: true,
	} satisfies ToasterProps;
</script>

<svelte:head>
	<title>Epicenter</title>
</svelte:head>

<QueryClientProvider client={queryClient}>
	<Sidebar.Provider>
		<AppSidebar />
		<Sidebar.Inset>
			<header class="flex h-12 items-center border-b px-4">
				<Sidebar.Trigger />
				<span class="ml-2 text-sm font-medium">Epicenter Workspaces</span>
			</header>
			<main class="flex-1 p-4">
				{@render children()}
			</main>
		</Sidebar.Inset>
	</Sidebar.Provider>
</QueryClientProvider>

<Toaster offset={16} theme={mode.current} {...TOASTER_SETTINGS} />
<ModeWatcher defaultMode="dark" track={false} />
