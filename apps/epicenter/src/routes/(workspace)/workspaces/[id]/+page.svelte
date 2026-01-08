<script lang="ts">
	import { page } from '$app/state';
	import { rpc } from '$lib/query';
	import { createQuery } from '@tanstack/svelte-query';

	const workspaceId = $derived(page.params.id);

	const workspace = createQuery(() => ({
		...rpc.workspaces.getWorkspace(workspaceId ?? '').options,
		enabled: !!workspaceId,
	}));
</script>

<div class="space-y-6">
	{#if workspace.isPending}
		<div class="text-muted-foreground">Loading workspace...</div>
	{:else if workspace.error}
		<div class="rounded-lg border border-destructive bg-destructive/10 p-4">
			<p class="text-destructive font-medium">Failed to load workspace</p>
			<p class="text-destructive/80 text-sm">{workspace.error.message}</p>
		</div>
	{:else if workspace.data}
		<div class="space-y-4">
			<div>
				<h1 class="text-2xl font-bold">{workspace.data.name}</h1>
				<p class="text-muted-foreground text-sm">ID: {workspace.data.id}</p>
			</div>

			<div class="grid gap-4 md:grid-cols-2">
				<div class="rounded-lg border p-4">
					<h2 class="mb-2 font-medium">Schema</h2>
					<dl class="text-sm space-y-1">
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Tables</dt>
							<dd>{Object.keys(workspace.data.tables).length}</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-muted-foreground">KV Entries</dt>
							<dd>{Object.keys(workspace.data.kv).length}</dd>
						</div>
					</dl>
				</div>
			</div>

			<div class="rounded-lg border p-4">
				<h2 class="mb-2 font-medium">Raw JSON</h2>
				<pre class="bg-muted overflow-auto rounded p-4 text-xs">{JSON.stringify(
						workspace.data,
						null,
						2,
					)}</pre>
			</div>
		</div>
	{/if}
</div>
