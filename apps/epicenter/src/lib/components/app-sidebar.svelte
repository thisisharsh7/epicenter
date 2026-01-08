<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as Sidebar from '@epicenter/ui/sidebar';
	import * as Collapsible from '@epicenter/ui/collapsible';
	import WorkspaceSwitcher from '$lib/components/WorkspaceSwitcher.svelte';
	import { inputDialog } from '$lib/components/InputDialog.svelte';
	import { createTableDialog } from '$lib/components/CreateTableDialog.svelte';
	import { confirmationDialog } from '$lib/components/ConfirmationDialog.svelte';
	import { getTableMetadata } from '$lib/utils/normalize-table';
	import { rpc } from '$lib/query';
	import { createQuery, createMutation } from '@tanstack/svelte-query';
	import TableIcon from '@lucide/svelte/icons/table-2';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
	import TrashIcon from '@lucide/svelte/icons/trash-2';

	const selectedWorkspaceId = $derived(page.params.id);

	const workspace = createQuery(() => ({
		...rpc.workspaces.getWorkspace(selectedWorkspaceId ?? '').options,
		enabled: !!selectedWorkspaceId,
	}));

	const tableEntries = $derived(
		workspace.data
			? Object.entries(workspace.data.tables).map(([key, table]) => ({
					key,
					...getTableMetadata(key, table),
				}))
			: [],
	);
	const settings = $derived(
		workspace.data ? Object.keys(workspace.data.kv) : [],
	);

	const addTableMutation = createMutation(
		() => rpc.workspaces.addTable.options,
	);
	const addKvEntryMutation = createMutation(
		() => rpc.workspaces.addKvEntry.options,
	);
	const openDirectoryMutation = createMutation(
		() => rpc.workspaces.openWorkspacesDirectory.options,
	);
	const removeTableMutation = createMutation(
		() => rpc.workspaces.removeTable.options,
	);
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
					<Sidebar.GroupAction
						title="Add Table"
						onclick={() => {
							if (!selectedWorkspaceId) return;
							createTableDialog.open({
								onConfirm: async ({ name, id }) => {
									await addTableMutation.mutateAsync({
										workspaceId: selectedWorkspaceId,
										name,
										id,
									});
								},
							});
						}}
					>
						<PlusIcon />
						<span class="sr-only">Add Table</span>
					</Sidebar.GroupAction>
					<Collapsible.Content>
						<Sidebar.GroupContent>
							<Sidebar.Menu>
								{#each tableEntries as table (table.key)}
									<Sidebar.MenuItem>
										<Sidebar.MenuButton>
											{#snippet child({ props })}
												<a
													href="/workspaces/{selectedWorkspaceId}/tables/{table.key}"
													{...props}
												>
													<TableIcon />
													<span>{table.name}</span>
												</a>
											{/snippet}
										</Sidebar.MenuButton>
										<Sidebar.MenuAction
											showOnHover
											title="Delete Table"
											onclick={() => {
												if (!selectedWorkspaceId) return;
												confirmationDialog.open({
													title: 'Delete Table',
													description: `Are you sure you want to delete "${table.name}"? This action cannot be undone.`,
													confirm: { text: 'Delete', variant: 'destructive' },
													onConfirm: async () => {
														await removeTableMutation.mutateAsync({
															workspaceId: selectedWorkspaceId,
															tableName: table.key,
														});
														await goto(`/workspaces/${selectedWorkspaceId}`);
													},
												});
											}}
										>
											<TrashIcon class="size-4" />
											<span class="sr-only">Delete Table</span>
										</Sidebar.MenuAction>
									</Sidebar.MenuItem>
								{:else}
									<Sidebar.MenuItem>
										<span class="text-muted-foreground px-2 py-1 text-xs">
											No tables yet
										</span>
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
					<Sidebar.GroupAction
						title="Add Setting"
						onclick={() => {
							if (!selectedWorkspaceId) return;
							inputDialog.open({
								title: 'Add Setting',
								description: 'Enter a key for the new setting.',
								label: 'Setting Key',
								placeholder: 'e.g., api-url, feature-flags',
								onConfirm: async (key) => {
									await addKvEntryMutation.mutateAsync({
										workspaceId: selectedWorkspaceId,
										key,
									});
								},
							});
						}}
					>
						<PlusIcon />
						<span class="sr-only">Add Setting</span>
					</Sidebar.GroupAction>
					<Collapsible.Content>
						<Sidebar.GroupContent>
							<Sidebar.Menu>
								{#each settings as settingKey (settingKey)}
									<Sidebar.MenuItem>
										<Sidebar.MenuButton>
											{#snippet child({ props })}
												<a
													href="/workspaces/{selectedWorkspaceId}/settings/{settingKey}"
													{...props}
												>
													<SettingsIcon />
													<span>{settingKey}</span>
												</a>
											{/snippet}
										</Sidebar.MenuButton>
									</Sidebar.MenuItem>
								{:else}
									<Sidebar.MenuItem>
										<span class="text-muted-foreground px-2 py-1 text-xs">
											No settings yet
										</span>
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

	<Sidebar.Footer>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton
					onclick={() => openDirectoryMutation.mutate(undefined)}
					disabled={openDirectoryMutation.isPending}
				>
					<FolderOpenIcon />
					<span>Open Data Folder</span>
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>

	<Sidebar.Rail />
</Sidebar.Root>
