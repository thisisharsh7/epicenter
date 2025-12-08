<script lang="ts">
	import { rpc } from '$lib/query';
	import { createQuery } from '@tanstack/svelte-query';
	import TabItem from './TabItem.svelte';
	import { Skeleton } from '@epicenter/ui/skeleton';
	import * as Alert from '@epicenter/ui/alert';
	import * as Empty from '@epicenter/ui/empty';
	import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';

	// Get all tabs
	const tabsQuery = createQuery(rpc.tabs.getAll.options);
	const windowsQuery = createQuery(rpc.tabs.getAllWindows.options);

	// Group tabs by window
	const tabsByWindow = $derived.by(() => {
		if (!tabsQuery.data || !windowsQuery.data)
			return new Map<number, Browser.tabs.Tab[]>();

		const grouped = new Map<number, Browser.tabs.Tab[]>();
		for (const window of windowsQuery.data) {
			const windowTabs = tabsQuery.data.filter((t) => t.windowId === window.id);
			// Sort by index
			windowTabs.sort((a, b) => a.index - b.index);
			grouped.set(window.id!, windowTabs);
		}
		return grouped;
	});
</script>

<div class="flex flex-col">
	{#if tabsQuery.isPending}
		<div class="flex flex-col gap-1 p-2">
			{#each { length: 5 } as _}
				<div class="flex items-center gap-3 px-4 py-2">
					<Skeleton class="h-4 w-4 rounded-sm" />
					<div class="flex-1 space-y-1">
						<Skeleton class="h-4 w-3/4" />
						<Skeleton class="h-3 w-1/2" />
					</div>
				</div>
			{/each}
		</div>
	{:else if tabsQuery.error}
		<div class="p-4">
			<Alert.Root variant="destructive">
				<AlertCircleIcon />
				<Alert.Title>Error loading tabs</Alert.Title>
				<Alert.Description>{tabsQuery.error.message}</Alert.Description>
			</Alert.Root>
		</div>
	{:else if tabsQuery.data}
		{@const windows = windowsQuery.data ?? []}
		{#if windows.length === 0}
			<Empty.Root class="py-8">
				<Empty.Media>
					<FolderOpenIcon class="size-8 text-muted-foreground" />
				</Empty.Media>
				<Empty.Title>No tabs found</Empty.Title>
				<Empty.Description>
					Open some tabs to see them here
				</Empty.Description>
			</Empty.Root>
		{:else}
			{#each windows as window (window.id)}
				{@const windowTabs = tabsByWindow.get(window.id!) ?? []}
				<div class="border-b last:border-b-0">
					<div class="flex items-center gap-2 px-4 py-2 bg-muted/50">
						<span class="text-xs font-medium text-muted-foreground">
							Window {window.focused ? '(focused)' : ''}
						</span>
						<span class="text-xs text-muted-foreground">
							{windowTabs.length} tab{windowTabs.length === 1 ? '' : 's'}
						</span>
					</div>
					<div class="divide-y">
						{#each windowTabs as tab (tab.id)}
							<TabItem {tab} />
						{/each}
					</div>
				</div>
			{/each}
		{/if}
	{/if}
</div>
