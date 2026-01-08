<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as Sidebar from '@epicenter/ui/sidebar';
	import * as Collapsible from '@epicenter/ui/collapsible';
	import * as DropdownMenu from '@epicenter/ui/dropdown-menu';
	import { inputDialog } from '$lib/components/InputDialog.svelte';
	import { createTableDialog } from '$lib/components/CreateTableDialog.svelte';
	import { confirmationDialog } from '$lib/components/ConfirmationDialog.svelte';
	import { getTableMetadata } from '$lib/utils/normalize-table';
	import { rpc } from '$lib/query';
	import { createQuery, createMutation } from '@tanstack/svelte-query';
	import TableIcon from '@lucide/svelte/icons/table-2';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';

	const workspaceId = $derived(page.params.id);

	const workspaces = createQuery(() => rpc.workspaces.listWorkspaces.options);
	const workspace = createQuery(() => ({
		...rpc.workspaces.getWorkspace(workspaceId ?? '').options,
		enabled: !!workspaceId,
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
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Sidebar.MenuButton
								size="lg"
								class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
								{...props}
							>
								<div
									class="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 items-center justify-center rounded-lg"
								>
									<FolderIcon class="size-4" />
								</div>
								<div class="grid flex-1 text-left text-sm leading-tight">
									<span class="truncate font-semibold">
										{workspace.data?.name ?? 'Loading...'}
									</span>
									<span class="truncate text-xs text-muted-foreground">
										{workspaceId}
									</span>
								</div>
								<ChevronsUpDownIcon class="ml-auto" />
							</Sidebar.MenuButton>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content
						class="w-[--bits-dropdown-menu-anchor-width] min-w-56 rounded-lg"
						align="start"
						side="bottom"
						sideOffset={4}
					>
						<DropdownMenu.Label class="text-muted-foreground text-xs">
							Switch Workspace
						</DropdownMenu.Label>
						{#if workspaces.data}
							{#each workspaces.data as ws (ws.id)}
								<DropdownMenu.Item
									onclick={() => goto(`/workspaces/${ws.id}`)}
									class={ws.id === workspaceId ? 'bg-accent' : ''}
								>
									<FolderIcon class="mr-2 size-4" />
									{ws.name}
								</DropdownMenu.Item>
							{/each}
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton>
							{#snippet child({ props })}
								<a href="/" {...props}>
									<LayoutGridIcon />
									<span>All Workspaces</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>

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
						if (!workspaceId) return;
						createTableDialog.open({
							onConfirm: async ({ name, id }) => {
								await addTableMutation.mutateAsync({
									workspaceId,
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
												href="/workspaces/{workspaceId}/tables/{table.key}"
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
											if (!workspaceId) return;
											confirmationDialog.open({
												title: 'Delete Table',
												description: `Are you sure you want to delete "${table.name}"? This action cannot be undone.`,
												confirm: { text: 'Delete', variant: 'destructive' },
												onConfirm: async () => {
													await removeTableMutation.mutateAsync({
														workspaceId,
														tableName: table.key,
													});
													await goto(`/workspaces/${workspaceId}`);
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
						if (!workspaceId) return;
						inputDialog.open({
							title: 'Add Setting',
							description: 'Enter a key for the new setting.',
							label: 'Setting Key',
							placeholder: 'e.g., api-url, feature-flags',
							onConfirm: async (key) => {
								await addKvEntryMutation.mutateAsync({
									workspaceId,
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
												href="/workspaces/{workspaceId}/settings/{settingKey}"
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
