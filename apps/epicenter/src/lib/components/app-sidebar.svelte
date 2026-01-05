<script lang="ts">
	import { createQuery, createMutation } from '@tanstack/svelte-query';
	import { rpc } from '$lib/query';
	import { page } from '$app/state';
	import * as Sidebar from '@epicenter/ui/sidebar';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import HomeIcon from '@lucide/svelte/icons/home';
	import { workspaceCreateDialog } from '$lib/components/WorkspaceCreateDialog.svelte';

	const workspaces = createQuery(() => rpc.workspaces.listWorkspaces.options);
	const createWorkspace = createMutation(
		() => rpc.workspaces.createWorkspace.options,
	);

	function handleCreateWorkspace() {
		workspaceCreateDialog.open({
			onConfirm: async ({ name, id }) => {
				await createWorkspace.mutateAsync({ name, id });
			},
		});
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
							</Sidebar.MenuItem>
						{/each}
					{/if}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>

	<Sidebar.Rail />
</Sidebar.Root>
