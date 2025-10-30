<script lang="ts">
	import TransformationsPage from '../../(config)/transformations/+page.svelte';
	import { useSidebar } from '@repo/ui/sidebar';

	const sidebar = useSidebar();
</script>

<div class:hidden-header={sidebar.state === 'expanded'}>
	<TransformationsPage />
</div>

<style>
	.hidden-header :global(h1) {
		display: none;
	}
</style>
