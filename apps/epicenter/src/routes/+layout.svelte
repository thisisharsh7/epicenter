<script lang="ts">
	import { queryClient, rpc } from '$lib/query';
	import { QueryClientProvider, createQuery } from '@tanstack/svelte-query';
	import { ModeWatcher, mode } from 'mode-watcher';
	import { Toaster, type ToasterProps } from 'svelte-sonner';
	import { page } from '$app/state';
	import '@epicenter/ui/app.css';
	import * as Sidebar from '@epicenter/ui/sidebar';
	import * as Breadcrumb from '@epicenter/ui/breadcrumb';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import InputDialog from '$lib/components/InputDialog.svelte';
	import CreateTableDialog from '$lib/components/CreateTableDialog.svelte';
	import CreateWorkspaceDialog from '$lib/components/CreateWorkspaceDialog.svelte';
	import ConfirmationDialog from '$lib/components/ConfirmationDialog.svelte';
	import { getTableMetadata } from '$lib/utils/normalize-table';

	let { children } = $props();

	const workspaceId = $derived(page.params.id);
	const tableId = $derived(page.params.tableId);
	const settingKey = $derived(page.params.key);

	const workspace = createQuery(() => ({
		...rpc.workspaces.getWorkspace(workspaceId ?? '').options,
		enabled: !!workspaceId,
	}));

	const workspaceName = $derived(workspace.data?.name ?? workspaceId);
	const tableName = $derived(() => {
		if (!tableId || !workspace.data?.tables) return tableId;
		const table = workspace.data.tables[tableId];
		if (!table) return tableId;
		return getTableMetadata(tableId, table).name;
	});

	const TOASTER_SETTINGS = {
		position: 'bottom-right',
		richColors: true,
		duration: 5000,
		visibleToasts: 5,
		closeButton: true,
	} satisfies ToasterProps;
</script>

<svelte:head>
	<title>Epicenter</title>
</svelte:head>

<QueryClientProvider client={queryClient}>
	<Sidebar.Provider>
		<AppSidebar />
		<Sidebar.Inset>
			<header class="flex h-12 items-center gap-2 border-b px-4">
				<Sidebar.Trigger />
				<Breadcrumb.Root>
					<Breadcrumb.List>
						<Breadcrumb.Item>
							{#if workspaceId}
								<Breadcrumb.Link href="/">Workspaces</Breadcrumb.Link>
							{:else}
								<Breadcrumb.Page>Workspaces</Breadcrumb.Page>
							{/if}
						</Breadcrumb.Item>

						{#if workspaceId}
							<Breadcrumb.Separator />
							<Breadcrumb.Item>
								{#if tableId || settingKey}
									<Breadcrumb.Link href="/workspaces/{workspaceId}">
										{workspaceName}
									</Breadcrumb.Link>
								{:else}
									<Breadcrumb.Page>{workspaceName}</Breadcrumb.Page>
								{/if}
							</Breadcrumb.Item>
						{/if}

						{#if tableId}
							<Breadcrumb.Separator />
							<Breadcrumb.Item>
								<Breadcrumb.Page>{tableName()}</Breadcrumb.Page>
							</Breadcrumb.Item>
						{/if}

						{#if settingKey}
							<Breadcrumb.Separator />
							<Breadcrumb.Item>
								<Breadcrumb.Page>{settingKey}</Breadcrumb.Page>
							</Breadcrumb.Item>
						{/if}
					</Breadcrumb.List>
				</Breadcrumb.Root>
			</header>
			<main class="flex-1 p-4">
				{@render children()}
			</main>
		</Sidebar.Inset>
	</Sidebar.Provider>
</QueryClientProvider>

<InputDialog />
<CreateTableDialog />
<CreateWorkspaceDialog />
<ConfirmationDialog />
<Toaster offset={16} theme={mode.current} {...TOASTER_SETTINGS} />
<ModeWatcher defaultMode="dark" track={false} />
