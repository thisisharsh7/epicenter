<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { rpc } from '$lib/query';
	import TabItem from './TabItem.svelte';

	// Get all tabs
	const tabsQuery = createQuery(rpc.tabs.getAll.options);
	const windowsQuery = createQuery(rpc.tabs.getAllWindows.options);

	// Group tabs by window
	const tabsByWindow = $derived.by(() => {
		if (!$tabsQuery.data || !$windowsQuery.data)
			return new Map<number, Browser.tabs.Tab[]>();

		const grouped = new Map<number, Browser.tabs.Tab[]>();
		for (const window of $windowsQuery.data) {
			const windowTabs = $tabsQuery.data.filter((t) => t.windowId === window.id);
			// Sort by index
			windowTabs.sort((a, b) => a.index - b.index);
			grouped.set(window.id!, windowTabs);
		}
		return grouped;
	});
</script>

<div class="flex flex-col">
	{#if $tabsQuery.isPending}
		<div class="flex items-center justify-center p-8">
			<div class="text-sm text-muted-foreground">Loading tabs...</div>
		</div>
	{:else if $tabsQuery.error}
		<div class="p-4 text-sm text-destructive">
			Error loading tabs: {$tabsQuery.error.message}
		</div>
	{:else if $tabsQuery.data}
		{@const windows = $windowsQuery.data ?? []}
		{#if windows.length === 0}
			<div class="p-4 text-sm text-muted-foreground">No tabs found</div>
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
