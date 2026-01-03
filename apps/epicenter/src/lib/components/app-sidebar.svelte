<script lang="ts">
	import { createQuery, createMutation } from '@tanstack/svelte-query';
	import { rpc } from '$lib/query';
	import { page } from '$app/state';
	import * as Sidebar from '@epicenter/ui/sidebar';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import HomeIcon from '@lucide/svelte/icons/home';

	const workspaceIds = createQuery(
		() => rpc.workspaces.listWorkspaceIds.options,
	);
	const createWorkspace = createMutation(
		() => rpc.workspaces.createWorkspace.options,
	);

	function handleCreateWorkspace() {
		const name = prompt('Enter workspace name:');
		if (name) {
			createWorkspace.mutate({ name });
		}
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
					{#if workspaceIds.isPending}
						{#each Array.from({ length: 3 }) as _, i (i)}
							<Sidebar.MenuItem>
								<Sidebar.MenuSkeleton />
							</Sidebar.MenuItem>
						{/each}
					{:else if workspaceIds.data}
						{#each workspaceIds.data as id (id)}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={page.params.workspace_id === id}>
									{#snippet child({ props })}
										<a href="/{id}" {...props}>
											<FolderIcon />
											<span>{id}</span>
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
