<script module lang="ts">
	import {
		createEpicenterClient,
		defineEpicenter,
		type EpicenterClient,
	} from '@epicenter/hq';
	import { tabsWorkspace } from './tabs.workspace';

	const config = defineEpicenter({
		id: 'tab-manager',
		workspaces: [tabsWorkspace],
	});

	type Client = EpicenterClient<typeof config.workspaces>;

	let client: Client | null = null;

	async function init(): Promise<void> {
		client = await createEpicenterClient(config);
	}

	export const epicenter = {
		get client(): Client {
			if (!client) {
				throw new Error(
					'Epicenter client not initialized. Wrap your app in EpicenterProvider.',
				);
			}
			return client;
		},
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';

	let { children }: { children: Snippet } = $props();
	let ready = $state(false);

	onMount(async () => {
		await init();
		ready = true;
	});
</script>

{#if ready}
	{@render children()}
{/if}
