<script lang="ts">
	import RecordingsPage from '../../(config)/recordings/+page.svelte';
	import { useSidebar } from '@repo/ui/sidebar';

	const sidebar = useSidebar();
</script>

<div class:hidden-header={sidebar.state === 'expanded'}>
	<RecordingsPage />
</div>

<style>
	.hidden-header :global(h1) {
		display: none;
	}
</style>
