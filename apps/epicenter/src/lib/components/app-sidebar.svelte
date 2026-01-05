<script lang="ts">
	import { createQuery, createMutation } from '@tanstack/svelte-query';
	import { rpc } from '$lib/query';
	import { page } from '$app/state';
	import * as Sidebar from '@epicenter/ui/sidebar';
	import * as DropdownMenu from '@epicenter/ui/dropdown-menu';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import HomeIcon from '@lucide/svelte/icons/home';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import { workspaceCreateDialog } from '$lib/components/WorkspaceCreateDialog.svelte';

	const workspaces = createQuery(() => rpc.workspaces.listWorkspaces.options);
	const createWorkspace = createMutation(
		() => rpc.workspaces.createWorkspace.options,
	);
	const deleteWorkspace = createMutation(
		() => rpc.workspaces.deleteWorkspace.options,
	);

	function handleCreateWorkspace() {
		workspaceCreateDialog.open({
			onConfirm: async ({ name, id }) => {
				await createWorkspace.mutateAsync({ name, id });
			},
		});
	}

	function handleDeleteWorkspace(id: string) {
		deleteWorkspace.mutate(id);
	}
</script>

<Sidebar.Root>
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton>
					{#snippet child({ props })}
						<a href="/" {...props}>
							<HomeIcon />
							<span>Epicenter</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupLabel>Workspaces</Sidebar.GroupLabel>
			<Sidebar.GroupAction
				title="Create Workspace"
				onclick={handleCreateWorkspace}
			>
				<PlusIcon />
				<span class="sr-only">Create Workspace</span>
			</Sidebar.GroupAction>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					{#if workspaces.isPending}
						{#each Array.from({ length: 3 }) as _, i (i)}
							<Sidebar.MenuItem>
								<Sidebar.MenuSkeleton />
							</Sidebar.MenuItem>
						{/each}
					{:else if workspaces.data}
						{#each workspaces.data as workspace (workspace.id)}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={page.params.id === workspace.id}>
									{#snippet child({ props })}
										<a href="/workspaces/{workspace.id}" {...props}>
											<FolderIcon />
											<div class="grid flex-1 text-left text-sm leading-tight">
												<span class="truncate font-semibold"
													>{workspace.name}</span
												>
												<span class="truncate text-xs text-muted-foreground"
													>{workspace.id}</span
												>
											</div>
										</a>
									{/snippet}
								</Sidebar.MenuButton>
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<Sidebar.MenuAction {...props}>
												<EllipsisIcon />
												<span class="sr-only">More options</span>
											</Sidebar.MenuAction>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content side="right" align="start">
										<DropdownMenu.Item
											class="text-destructive focus:text-destructive"
											onclick={() => handleDeleteWorkspace(workspace.id)}
										>
											<TrashIcon class="mr-2 size-4" />
											Delete
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</Sidebar.MenuItem>
						{/each}
					{/if}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>

	<Sidebar.Rail />
</Sidebar.Root>
