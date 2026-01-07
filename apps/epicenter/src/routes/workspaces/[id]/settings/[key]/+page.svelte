<script lang="ts">
	import { page } from '$app/state';
	import * as Card from '@epicenter/ui/card';
	import { Badge } from '@epicenter/ui/badge';
	import { Button } from '@epicenter/ui/button';
	import { rpc } from '$lib/query';
	import { createQuery } from '@tanstack/svelte-query';
	import type { KvFieldSchema } from '@epicenter/hq';

	const workspaceId = $derived(page.params.id);
	const settingKey = $derived(page.params.key);

	const workspace = createQuery(() => ({
		...rpc.workspaces.getWorkspace(workspaceId ?? '').options,
		enabled: !!workspaceId,
	}));

	const kvSchema = $derived.by(() => {
		if (!settingKey || !workspace.data?.kv) return undefined;
		return workspace.data.kv[settingKey] as KvFieldSchema | undefined;
	});

	const isNullable = $derived(
		kvSchema
			? Array.isArray(kvSchema.type) && kvSchema.type.includes('null')
			: false,
	);
</script>

<div class="space-y-6">
	<div class="flex items-center gap-2 text-sm">
		<a href="/" class="text-muted-foreground hover:text-foreground">
			Workspaces
		</a>
		<span class="text-muted-foreground">/</span>
		<a
			href="/workspaces/{workspaceId}"
			class="text-muted-foreground hover:text-foreground"
		>
			{workspaceId}
		</a>
		<span class="text-muted-foreground">/</span>
		<span class="text-muted-foreground">Settings</span>
		<span class="text-muted-foreground">/</span>
		<span class="font-medium">{settingKey}</span>
	</div>

	{#if workspace.isPending}
		<div class="text-muted-foreground">Loading...</div>
	{:else if workspace.error}
		<div class="rounded-lg border border-destructive bg-destructive/10 p-4">
			<p class="text-destructive font-medium">Failed to load workspace</p>
			<p class="text-destructive/80 text-sm">{workspace.error.message}</p>
		</div>
	{:else if !kvSchema}
		<div class="rounded-lg border border-destructive bg-destructive/10 p-4">
			<p class="text-destructive font-medium">Setting not found</p>
			<p class="text-destructive/80 text-sm">
				The setting "{settingKey}" does not exist in this workspace.
			</p>
		</div>
	{:else}
		<Card.Root class="max-w-3xl">
			<Card.Header>
				<div class="flex items-center justify-between">
					<Card.Title class="text-xl">{settingKey}</Card.Title>
					<Badge variant="secondary">{kvSchema['x-component']}</Badge>
				</div>
				<Card.Description>KV entry schema definition</Card.Description>
			</Card.Header>

			<Card.Content class="space-y-4">
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="rounded-lg border p-4">
						<p
							class="text-muted-foreground mb-1 text-xs uppercase tracking-wide"
						>
							Type
						</p>
						<p class="font-mono text-sm">{kvSchema['x-component']}</p>
					</div>

					<div class="rounded-lg border p-4">
						<p
							class="text-muted-foreground mb-1 text-xs uppercase tracking-wide"
						>
							Nullable
						</p>
						<p class="text-sm">
							{#if isNullable}
								<Badge variant="outline">Yes</Badge>
							{:else}
								<span>No (required)</span>
							{/if}
						</p>
					</div>

					{#if 'default' in kvSchema}
						<div class="rounded-lg border p-4 sm:col-span-2">
							<p
								class="text-muted-foreground mb-1 text-xs uppercase tracking-wide"
							>
								Default Value
							</p>
							<code class="bg-muted rounded px-2 py-1 text-sm">
								{JSON.stringify(kvSchema.default)}
							</code>
						</div>
					{/if}
				</div>

				<div class="rounded-lg border p-4">
					<p class="text-muted-foreground mb-2 text-xs uppercase tracking-wide">
						Raw Schema
					</p>
					<pre
						class="bg-muted overflow-auto rounded p-4 text-xs">{JSON.stringify(
							kvSchema,
							null,
							2,
						)}</pre>
				</div>
			</Card.Content>

			<Card.Footer class="flex justify-end gap-2">
				<Button variant="outline" disabled>Edit Schema</Button>
				<Button variant="destructive" disabled>Delete</Button>
			</Card.Footer>
		</Card.Root>
	{/if}
</div>
