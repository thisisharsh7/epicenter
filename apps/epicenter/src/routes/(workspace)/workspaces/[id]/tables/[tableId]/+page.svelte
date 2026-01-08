<script lang="ts">
	import { page } from '$app/state';
	import * as Table from '@epicenter/ui/table';
	import { Button } from '@epicenter/ui/button';
	import * as DropdownMenu from '@epicenter/ui/dropdown-menu';
	import * as Empty from '@epicenter/ui/empty';
	import { Badge } from '@epicenter/ui/badge';
	import { rpc } from '$lib/query';
	import { createQuery } from '@tanstack/svelte-query';
	import { isNullableFieldSchema, type FieldSchema } from '@epicenter/hq';
	import { getTableFields, getTableMetadata } from '$lib/utils/normalize-table';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import SearchXIcon from '@lucide/svelte/icons/search-x';

	const workspaceId = $derived(page.params.id);
	const tableId = $derived(page.params.tableId);

	const workspace = createQuery(() => ({
		...rpc.workspaces.getWorkspace(workspaceId ?? '').options,
		enabled: !!workspaceId,
	}));

	const tableEntry = $derived.by(() => {
		if (!tableId || !workspace.data?.tables) return undefined;
		return workspace.data.tables[tableId];
	});

	const tableFields = $derived(
		tableEntry ? getTableFields(tableEntry) : undefined,
	);
	const tableMetadata = $derived(
		tableId && tableEntry ? getTableMetadata(tableId, tableEntry) : undefined,
	);

	const columns = $derived(
		tableFields ? (Object.entries(tableFields) as [string, FieldSchema][]) : [],
	);
</script>

<div class="space-y-4">
	{#if workspace.isPending}
		<div class="text-muted-foreground">Loading...</div>
	{:else if workspace.error}
		<Empty.Root class="border-destructive/50">
			<Empty.Header>
				<Empty.Media variant="icon" class="bg-destructive/10 text-destructive">
					<TriangleAlertIcon />
				</Empty.Media>
				<Empty.Title>Failed to load workspace</Empty.Title>
				<Empty.Description>{workspace.error.message}</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Button variant="outline" onclick={() => workspace.refetch()}>
					Try again
				</Button>
			</Empty.Content>
		</Empty.Root>
	{:else if !tableFields}
		<Empty.Root>
			<Empty.Header>
				<Empty.Media variant="icon">
					<SearchXIcon />
				</Empty.Media>
				<Empty.Title>Table not found</Empty.Title>
				<Empty.Description>
					The table "{tableId}" does not exist in this workspace.
				</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Button variant="outline" href="/workspaces/{workspaceId}">
					Back to workspace
				</Button>
			</Empty.Content>
		</Empty.Root>
	{:else}
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-semibold">{tableMetadata?.name ?? tableId}</h1>
				<p class="text-muted-foreground text-sm">
					{columns.length} column{columns.length === 1 ? '' : 's'}
				</p>
			</div>
			<Button disabled>
				<PlusIcon class="mr-2 size-4" />
				Add Column
			</Button>
		</div>

		<div class="rounded-md border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Column Name</Table.Head>
						<Table.Head>Type</Table.Head>
						<Table.Head>Nullable</Table.Head>
						<Table.Head>Default</Table.Head>
						<Table.Head class="w-12"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each columns as [columnName, schema] (columnName)}
						{@const isNullable = isNullableFieldSchema(schema)}
						{@const hasDefault = 'default' in schema}
						<Table.Row>
							<Table.Cell class="font-mono text-sm">{columnName}</Table.Cell>
							<Table.Cell>
								<Badge variant="secondary">{schema.type}</Badge>
							</Table.Cell>
							<Table.Cell>
								{#if isNullable}
									<Badge variant="outline">nullable</Badge>
								{:else}
									<span class="text-muted-foreground text-sm">required</span>
								{/if}
							</Table.Cell>
							<Table.Cell>
								{#if hasDefault}
									<code class="bg-muted rounded px-1.5 py-0.5 text-xs">
										{JSON.stringify(schema.default)}
									</code>
								{:else}
									<span class="text-muted-foreground text-sm">-</span>
								{/if}
							</Table.Cell>
							<Table.Cell>
								{#if columnName !== 'id'}
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<Button
													{...props}
													variant="ghost"
													size="icon"
													class="size-8"
												>
													<EllipsisIcon class="size-4" />
													<span class="sr-only">Open menu</span>
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											<DropdownMenu.Item disabled>Edit</DropdownMenu.Item>
											<DropdownMenu.Separator />
											<DropdownMenu.Item class="text-destructive" disabled>
												<TrashIcon class="mr-2 size-4" />
												Delete
											</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								{/if}
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={5} class="h-24 text-center">
								<Empty.Root>
									<Empty.Title>No columns</Empty.Title>
									<Empty.Description>
										This table has no columns defined yet.
									</Empty.Description>
								</Empty.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>

		<div class="rounded-lg border p-4">
			<h2 class="mb-2 font-medium">Raw Schema</h2>
			<pre class="bg-muted overflow-auto rounded p-4 text-xs">{JSON.stringify(
					tableEntry,
					null,
					2,
				)}</pre>
		</div>
	{/if}
</div>
