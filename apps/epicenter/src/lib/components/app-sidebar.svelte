<script lang="ts">
	import { page } from '$app/state';
	import * as Sidebar from '@epicenter/ui/sidebar';
	import * as Collapsible from '@epicenter/ui/collapsible';
	import WorkspaceSwitcher from '$lib/components/WorkspaceSwitcher.svelte';
	import TableIcon from '@lucide/svelte/icons/table-2';
	import KeyIcon from '@lucide/svelte/icons/key-round';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import PlusIcon from '@lucide/svelte/icons/plus';

	const selectedWorkspaceId = $derived(page.params.id);

	const mockTables = [
		{ id: 'users', name: 'users' },
		{ id: 'posts', name: 'posts' },
		{ id: 'comments', name: 'comments' },
	];

	const mockVariables = [
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
			<Collapsible.Root open class="group/collapsible">
				<Sidebar.Group>
					<Sidebar.GroupLabel>
						{#snippet child({ props })}
							<Collapsible.Trigger {...props}>
								Tables
								<ChevronRightIcon
									class="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90"
								/>
							</Collapsible.Trigger>
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

			<Collapsible.Root open class="group/collapsible">
				<Sidebar.Group>
					<Sidebar.GroupLabel>
						{#snippet child({ props })}
							<Collapsible.Trigger {...props}>
								Variables
								<ChevronRightIcon
									class="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90"
								/>
							</Collapsible.Trigger>
						{/snippet}
					</Sidebar.GroupLabel>
					<Sidebar.GroupAction title="Add Variable">
						<PlusIcon />
						<span class="sr-only">Add Variable</span>
					</Sidebar.GroupAction>
					<Collapsible.Content>
						<Sidebar.GroupContent>
							<Sidebar.Menu>
								{#each mockVariables as variable (variable.id)}
									<Sidebar.MenuItem>
										<Sidebar.MenuButton>
											{#snippet child({ props })}
												<a
													href="/workspaces/{selectedWorkspaceId}/variables/{variable.id}"
													{...props}
												>
													<KeyIcon />
													<span>{variable.name}</span>
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
				Select a workspace to view tables and variables.
			</div>
		{/if}
	</Sidebar.Content>

	<Sidebar.Rail />
</Sidebar.Root>
