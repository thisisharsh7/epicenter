<script lang="ts">
	import { page } from '$app/state';
	import * as Sidebar from '@epicenter/ui/sidebar';
	import * as Collapsible from '@epicenter/ui/collapsible';
	import WorkspaceSwitcher from '$lib/components/WorkspaceSwitcher.svelte';
	import TableIcon from '@lucide/svelte/icons/table-2';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import PlusIcon from '@lucide/svelte/icons/plus';

	const selectedWorkspaceId = $derived(page.params.id);

	const mockTables = [
		{ id: 'users', name: 'users' },
		{ id: 'posts', name: 'posts' },
		{ id: 'comments', name: 'comments' },
	];

	const mockSettings = [
		{ id: 'api-config', name: 'api-config' },
		{ id: 'feature-flags', name: 'feature-flags' },
	];
</script>

<Sidebar.Root>
	<Sidebar.Header>
		<WorkspaceSwitcher {selectedWorkspaceId} />
	</Sidebar.Header>

	<Sidebar.Content>
		{#if selectedWorkspaceId}
			<Collapsible.Root open>
				<Sidebar.Group>
					<Sidebar.GroupLabel>
						{#snippet child({ props })}
							<Collapsible.Trigger {...props}>Tables</Collapsible.Trigger>
						{/snippet}
					</Sidebar.GroupLabel>
					<Sidebar.GroupAction title="Add Table">
						<PlusIcon />
						<span class="sr-only">Add Table</span>
					</Sidebar.GroupAction>
					<Collapsible.Content>
						<Sidebar.GroupContent>
							<Sidebar.Menu>
								{#each mockTables as table (table.id)}
									<Sidebar.MenuItem>
										<Sidebar.MenuButton>
											{#snippet child({ props })}
												<a
													href="/workspaces/{selectedWorkspaceId}/tables/{table.id}"
													{...props}
												>
													<TableIcon />
													<span>{table.name}</span>
												</a>
											{/snippet}
										</Sidebar.MenuButton>
									</Sidebar.MenuItem>
								{/each}
							</Sidebar.Menu>
						</Sidebar.GroupContent>
					</Collapsible.Content>
				</Sidebar.Group>
			</Collapsible.Root>

			<Collapsible.Root open>
				<Sidebar.Group>
					<Sidebar.GroupLabel>
						{#snippet child({ props })}
							<Collapsible.Trigger {...props}>Settings</Collapsible.Trigger>
						{/snippet}
					</Sidebar.GroupLabel>
					<Sidebar.GroupAction title="Add Setting">
						<PlusIcon />
						<span class="sr-only">Add Setting</span>
					</Sidebar.GroupAction>
					<Collapsible.Content>
						<Sidebar.GroupContent>
							<Sidebar.Menu>
								{#each mockSettings as setting (setting.id)}
									<Sidebar.MenuItem>
										<Sidebar.MenuButton>
											{#snippet child({ props })}
												<a
													href="/workspaces/{selectedWorkspaceId}/settings/{setting.id}"
													{...props}
												>
													<SettingsIcon />
													<span>{setting.name}</span>
												</a>
											{/snippet}
										</Sidebar.MenuButton>
									</Sidebar.MenuItem>
								{/each}
							</Sidebar.Menu>
						</Sidebar.GroupContent>
					</Collapsible.Content>
				</Sidebar.Group>
			</Collapsible.Root>
		{:else}
			<div class="p-4 text-sm text-muted-foreground">
				Select a workspace to view tables and settings.
			</div>
		{/if}
	</Sidebar.Content>

	<Sidebar.Rail />
</Sidebar.Root>
