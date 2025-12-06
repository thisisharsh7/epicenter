<script lang="ts">
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import TabList from '$lib/components/TabList.svelte';

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 1000 * 60, // 1 minute
				refetchOnWindowFocus: true,
			},
		},
	});
</script>

<QueryClientProvider client={queryClient}>
	<main class="w-[400px] min-h-[300px] max-h-[600px] overflow-hidden bg-background text-foreground">
		<header class="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-3">
			<h1 class="text-lg font-semibold">Tab Manager</h1>
		</header>
		<div class="overflow-y-auto max-h-[calc(600px-60px)]">
			<TabList />
		</div>
	</main>
</QueryClientProvider>
