<script lang="ts">
	import { createQuery, createMutation } from '@tanstack/svelte-query';
	import { rpc } from '$lib/query';
	import { Button } from '@epicenter/ui/button';
	import { createWorkspaceDialog } from '$lib/components/CreateWorkspaceDialog.svelte';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';

	const workspaces = createQuery(() => rpc.workspaces.listWorkspaces.options);
	const createWorkspace = createMutation(
		() => rpc.workspaces.createWorkspace.options,
	);
	const openDirectory = createMutation(
		() => rpc.workspaces.openWorkspacesDirectory.options,
	);
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">All Workspaces</h1>
		<div class="flex gap-2">
			<Button
				variant="outline"
				onclick={() => openDirectory.mutate(undefined)}
				disabled={openDirectory.isPending}
			>
				<FolderOpenIcon class="mr-2 size-4" />
				Open Location
			</Button>
			<Button
				onclick={() =>
					createWorkspaceDialog.open({
						onConfirm: async ({ name, slug }) => {
							await createWorkspace.mutateAsync({ name, slug });
						},
					})}
				disabled={createWorkspace.isPending}
			>
				{createWorkspace.isPending ? 'Creating...' : 'Create Workspace'}
			</Button>
		</div>
	</div>

	{#if workspaces.isPending}
		<p class="text-muted-foreground">Loading workspaces...</p>
	{:else if workspaces.error}
		<p class="text-destructive">Error loading workspaces</p>
	{:else if workspaces.data?.length === 0}
		<div class="rounded-lg border border-dashed p-8 text-center">
			<p class="text-muted-foreground mb-4">No workspaces yet</p>
			<Button
				onclick={() =>
					createWorkspaceDialog.open({
						onConfirm: async ({ name, slug }) => {
							await createWorkspace.mutateAsync({ name, slug });
						},
					})}
			>
				Create your first workspace
			</Button>
		</div>
	{:else}
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each workspaces.data ?? [] as workspace (workspace.id)}
				<a
					href="/workspaces/{workspace.id}"
					class="hover:bg-accent block rounded-lg border p-4 transition-colors"
				>
					<h2 class="font-medium">{workspace.name}</h2>
					<p class="text-muted-foreground text-sm font-mono text-xs">
						{workspace.id}
					</p>
				</a>
			{/each}
		</div>
	{/if}
</div>
