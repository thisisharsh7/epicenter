<!--
	MigrationDialogTrigger

	A self-contained button that opens the Database Migration Manager dialog.
	Imports migrationDialog directly and shows an indicator dot when IndexedDB
	contains data that needs migration. On click, opens the migration dialog.
-->
<script lang="ts">
	import WhisperingButton from '$lib/components/WhisperingButton.svelte';
	import { migrationDialog } from '$lib/components/MigrationDialog.svelte';
	import { Database } from 'lucide-svelte';
</script>

<WhisperingButton
	tooltipContent="Database Migration Manager"
	variant="ghost"
	size="icon"
	class="relative"
	onclick={migrationDialog.openDialog}
>
	<Database class="size-4" aria-hidden="true" />
	{#if migrationDialog.hasIndexedDBData}
		<span
			class="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-amber-500 animate-ping"
		></span>
		<span
			class="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-amber-500"
		></span>
	{/if}
</WhisperingButton>
