<script lang="ts">
	import { createQuery, createMutation } from '@tanstack/svelte-query';
	import { rpc } from '$lib/query';
	import { Button } from '@epicenter/ui/button';
	import { inputDialog } from '$lib/components/InputDialog.svelte';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';

	const workspaceIds = createQuery(
		() => rpc.workspaces.listWorkspaceIds.options,
	);
	const createWorkspace = createMutation(
		() => rpc.workspaces.createWorkspace.options,
	);
	const openDirectory = createMutation(
		() => rpc.workspaces.openWorkspacesDirectory.options,
	);

	function handleCreate() {
		inputDialog.open({
			title: 'Create Workspace',
			description: 'Enter a name for your new workspace.',
			label: 'Workspace Name',
			placeholder: 'My Workspace',
			onConfirm: async (name) => {
				await createWorkspace.mutateAsync({ name });
			},
		});
	}

	function handleOpenDirectory() {
		openDirectory.mutate(undefined);
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Workspaces</h1>
		<div class="flex gap-2">
			<Button
				variant="outline"
				onclick={handleOpenDirectory}
				disabled={openDirectory.isPending}
			>
				<FolderOpenIcon class="mr-2 size-4" />
				Open Location
			</Button>
			<Button onclick={handleCreate} disabled={createWorkspace.isPending}>
				{createWorkspace.isPending ? 'Creating...' : 'Create Workspace'}
			</Button>
		</div>
	</div>

	{#if workspaceIds.isPending}
		<p class="text-muted-foreground">Loading workspaces...</p>
	{:else if workspaceIds.error}
		<p class="text-destructive">Error: {workspaceIds.error.message}</p>
	{:else if workspaceIds.data?.length === 0}
		<div class="rounded-lg border border-dashed p-8 text-center">
			<p class="text-muted-foreground mb-4">No workspaces yet</p>
			<Button onclick={handleCreate}>Create your first workspace</Button>
		</div>
	{:else}
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each workspaceIds.data ?? [] as id (id)}
				<a
					href="/{id}"
					class="hover:bg-accent block rounded-lg border p-4 transition-colors"
				>
					<h2 class="font-medium">{id}</h2>
					<p class="text-muted-foreground text-sm">Click to view workspace</p>
				</a>
			{/each}
		</div>
	{/if}
</div>
