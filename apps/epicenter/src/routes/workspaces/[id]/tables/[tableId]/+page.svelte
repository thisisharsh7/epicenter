<script lang="ts">
	import { page } from '$app/state';
	import * as Table from '@epicenter/ui/table';
	import { Button } from '@epicenter/ui/button';
	import { Input } from '@epicenter/ui/input';
	import { Checkbox } from '@epicenter/ui/checkbox';
	import * as DropdownMenu from '@epicenter/ui/dropdown-menu';
	import * as Empty from '@epicenter/ui/empty';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import SearchIcon from '@lucide/svelte/icons/search';
	import ArrowUpDownIcon from '@lucide/svelte/icons/arrow-up-down';

	const workspaceId = $derived(page.params.id);
	const tableId = $derived(page.params.tableId);

	type TableRow = {
		id: string;
		name: string;
		email: string;
		role: string;
		createdAt: string;
	};

	const mockData: TableRow[] = [
		{
			id: '1',
			name: 'Alice Chen',
			email: 'alice@example.com',
			role: 'Admin',
			createdAt: '2024-01-15',
		},
		{
			id: '2',
			name: 'Bob Smith',
			email: 'bob@example.com',
			role: 'Editor',
			createdAt: '2024-02-20',
		},
		{
			id: '3',
			name: 'Charlie Kim',
			email: 'charlie@example.com',
			role: 'Viewer',
			createdAt: '2024-03-10',
		},
	];

	let searchQuery = $state('');
	let selectedRows = $state<Set<string>>(new Set());
	let sortColumn = $state<keyof TableRow | null>(null);
	let sortDirection = $state<'asc' | 'desc'>('asc');

	const filteredData = $derived(
		mockData.filter(
			(row) =>
				row.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				row.email.toLowerCase().includes(searchQuery.toLowerCase()),
		),
	);

	const sortedData = $derived.by(() => {
		if (!sortColumn) return filteredData;
		const column = sortColumn;
		return [...filteredData].sort((a, b) => {
			const aVal = a[column];
			const bVal = b[column];
			const comparison = aVal.localeCompare(bVal);
			return sortDirection === 'asc' ? comparison : -comparison;
		});
	});

	function toggleSort(column: keyof TableRow) {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = 'asc';
		}
	}

	function toggleRowSelection(id: string) {
		const newSet = new Set(selectedRows);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		selectedRows = newSet;
	}

	function toggleAllSelection() {
		if (selectedRows.size === sortedData.length) {
			selectedRows = new Set();
		} else {
			selectedRows = new Set(sortedData.map((row) => row.id));
		}
	}

	const allSelected = $derived(
		sortedData.length > 0 && selectedRows.size === sortedData.length,
	);
	const someSelected = $derived(
		selectedRows.size > 0 && selectedRows.size < sortedData.length,
	);
</script>

<div class="space-y-4">
	<div class="flex items-center gap-2 text-sm">
		<a href="/" class="text-muted-foreground hover:text-foreground"
			>Workspaces</a
		>
		<span class="text-muted-foreground">/</span>
		<a
			href="/workspaces/{workspaceId}"
			class="text-muted-foreground hover:text-foreground"
		>
			{workspaceId}
		</a>
		<span class="text-muted-foreground">/</span>
		<span class="text-muted-foreground">Tables</span>
		<span class="text-muted-foreground">/</span>
		<span class="font-medium">{tableId}</span>
	</div>

	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-semibold">{tableId}</h1>
			<p class="text-muted-foreground text-sm">
				{mockData.length} rows
			</p>
		</div>
		<Button>
			<PlusIcon class="mr-2 size-4" />
			Add Row
		</Button>
	</div>

	<div class="flex items-center gap-2">
		<div class="relative max-w-sm flex-1">
			<SearchIcon
				class="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2"
			/>
			<Input placeholder="Search..." class="pl-9" bind:value={searchQuery} />
		</div>
	</div>

	<div class="rounded-md border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-12">
						<Checkbox
							checked={allSelected}
							indeterminate={someSelected}
							onCheckedChange={toggleAllSelection}
							aria-label="Select all"
						/>
					</Table.Head>
					<Table.Head>
						<Button
							variant="ghost"
							class="-ml-4"
							onclick={() => toggleSort('id')}
						>
							ID
							<ArrowUpDownIcon class="ml-2 size-4" />
						</Button>
					</Table.Head>
					<Table.Head>
						<Button
							variant="ghost"
							class="-ml-4"
							onclick={() => toggleSort('name')}
						>
							Name
							<ArrowUpDownIcon class="ml-2 size-4" />
						</Button>
					</Table.Head>
					<Table.Head>
						<Button
							variant="ghost"
							class="-ml-4"
							onclick={() => toggleSort('email')}
						>
							Email
							<ArrowUpDownIcon class="ml-2 size-4" />
						</Button>
					</Table.Head>
					<Table.Head>Role</Table.Head>
					<Table.Head>
						<Button
							variant="ghost"
							class="-ml-4"
							onclick={() => toggleSort('createdAt')}
						>
							Created
							<ArrowUpDownIcon class="ml-2 size-4" />
						</Button>
					</Table.Head>
					<Table.Head class="w-12"></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each sortedData as row (row.id)}
					<Table.Row data-state={selectedRows.has(row.id) && 'selected'}>
						<Table.Cell>
							<Checkbox
								checked={selectedRows.has(row.id)}
								onCheckedChange={() => toggleRowSelection(row.id)}
								aria-label="Select row"
							/>
						</Table.Cell>
						<Table.Cell class="font-mono text-xs">{row.id}</Table.Cell>
						<Table.Cell>{row.name}</Table.Cell>
						<Table.Cell>{row.email}</Table.Cell>
						<Table.Cell>{row.role}</Table.Cell>
						<Table.Cell>{row.createdAt}</Table.Cell>
						<Table.Cell>
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
									<DropdownMenu.Item
										onclick={() => console.log('Edit', row.id)}
									>
										Edit
									</DropdownMenu.Item>
									<DropdownMenu.Item
										onclick={() => console.log('Duplicate', row.id)}
									>
										Duplicate
									</DropdownMenu.Item>
									<DropdownMenu.Separator />
									<DropdownMenu.Item
										class="text-destructive"
										onclick={() => console.log('Delete', row.id)}
									>
										Delete
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={7} class="h-24 text-center">
							<Empty.Root>
								<Empty.Title>No data</Empty.Title>
								<Empty.Description>
									This table is empty. Add your first row to get started.
								</Empty.Description>
							</Empty.Root>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>

	<div class="flex items-center justify-between">
		<p class="text-muted-foreground text-sm">
			{selectedRows.size} of {sortedData.length} row(s) selected.
		</p>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="sm" disabled>Previous</Button>
			<Button variant="outline" size="sm" disabled>Next</Button>
		</div>
	</div>
</div>
