<script lang="ts">
	import { createQuery, createMutation } from '@tanstack/svelte-query';
	import { goto } from '$app/navigation';
	import { rpc } from '$lib/query';
	import * as Sidebar from '@epicenter/ui/sidebar';
	import * as DropdownMenu from '@epicenter/ui/dropdown-menu';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import CheckIcon from '@lucide/svelte/icons/check';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import { createWorkspaceDialog } from '$lib/components/CreateWorkspaceDialog.svelte';
	import { confirmationDialog } from '$lib/components/ConfirmationDialog.svelte';

	let { selectedWorkspaceId }: { selectedWorkspaceId: string | undefined } =
		$props();

	const workspaces = createQuery(() => rpc.workspaces.listWorkspaces.options);
	const createWorkspace = createMutation(
		() => rpc.workspaces.createWorkspace.options,
	);
	const deleteWorkspace = createMutation(
		() => rpc.workspaces.deleteWorkspace.options,
	);

	const selectedWorkspace = $derived(
		workspaces.data?.find((w) => w.id === selectedWorkspaceId),
	);
</script>

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
								{selectedWorkspace?.name ?? 'Select Workspace'}
							</span>
							{#if selectedWorkspace}
								<span class="truncate text-xs text-muted-foreground">
									{selectedWorkspace.id}
								</span>
							{:else}
								<span class="truncate text-xs text-muted-foreground">
									No workspace selected
								</span>
							{/if}
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
					Workspaces
				</DropdownMenu.Label>
				{#if workspaces.isPending}
					<DropdownMenu.Item disabled>Loading...</DropdownMenu.Item>
				{:else if workspaces.data}
					{#each workspaces.data as workspace (workspace.id)}
						<DropdownMenu.Sub>
							<div class="flex items-center">
								<DropdownMenu.Item
									onclick={() => goto(`/workspaces/${workspace.id}`)}
									class="flex-1"
								>
									<div class="rounded-sm border p-1">
										<FolderIcon />
									</div>
									{workspace.name}
									{#if workspace.id === selectedWorkspaceId}
										<CheckIcon class="ml-auto" />
									{/if}
								</DropdownMenu.Item>
								<DropdownMenu.SubTrigger
									class="p-1.5 [&>svg:last-child]:hidden"
								>
									<EllipsisIcon />
								</DropdownMenu.SubTrigger>
							</div>
							<DropdownMenu.SubContent class="min-w-32">
								<DropdownMenu.Item
									variant="destructive"
									onclick={() => {
										confirmationDialog.open({
											title: 'Delete Workspace',
											description: `Are you sure you want to delete "${workspace.name}"? This will permanently delete all tables and settings in this workspace.`,
											confirm: { text: 'Delete', variant: 'destructive' },
											onConfirm: async () => {
												await deleteWorkspace.mutateAsync(workspace.id);
												if (selectedWorkspaceId === workspace.id) {
													await goto('/');
												}
											},
										});
									}}
								>
									<TrashIcon class="size-4" />
									<span>Delete</span>
								</DropdownMenu.Item>
							</DropdownMenu.SubContent>
						</DropdownMenu.Sub>
					{/each}
				{/if}
				<DropdownMenu.Separator />
				<DropdownMenu.Item
					onclick={() =>
						createWorkspaceDialog.open({
							onConfirm: async ({ name, id }) => {
								await createWorkspace.mutateAsync({ name, id });
								goto(`/workspaces/${id}`);
							},
						})}
					class="gap-2 p-2"
				>
					<div
						class="bg-background flex size-6 items-center justify-center rounded-md border"
					>
						<PlusIcon class="size-4" />
					</div>
					<span class="text-muted-foreground font-medium">New Workspace</span>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
