<script lang="ts">
	import { queryClient } from '$lib/query';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { ModeWatcher, mode } from 'mode-watcher';
	import { Toaster, type ToasterProps } from 'svelte-sonner';
	import '@epicenter/ui/app.css';
	import InputDialog from '$lib/components/InputDialog.svelte';
	import CreateTableDialog from '$lib/components/CreateTableDialog.svelte';
	import CreateSettingDialog from '$lib/components/CreateSettingDialog.svelte';
	import CreateWorkspaceDialog from '$lib/components/CreateWorkspaceDialog.svelte';
	import ConfirmationDialog from '$lib/components/ConfirmationDialog.svelte';

	let { children } = $props();

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
	{@render children()}
</QueryClientProvider>

<InputDialog />
<CreateTableDialog />
<CreateSettingDialog />
<CreateWorkspaceDialog />
<ConfirmationDialog />
<Toaster offset={16} theme={mode.current} {...TOASTER_SETTINGS} />
<ModeWatcher defaultMode="dark" track={false} />
