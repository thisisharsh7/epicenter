<script lang="ts">
	import { Badge } from '@epicenter/ui/badge';
	import * as Field from '@epicenter/ui/field';
	import { Input } from '@epicenter/ui/input';
	import { Link } from '@epicenter/ui/link';
	import { settings } from '$lib/stores/settings.svelte';

	type Props = {
		showBadges?: boolean;
	};

	let { showBadges = false }: Props = $props();

	const capabilities = ['Transcription'] as const;
</script>

<Field.Field>
	<Field.Label for="deepgram-api-key" class="flex items-center gap-2">
		Deepgram API Key
		{#if showBadges}
			{#each capabilities as capability}
				<Badge variant="secondary" class="text-xs">{capability}</Badge>
			{/each}
		{/if}
	</Field.Label>
	<Input
		id="deepgram-api-key"
		type="password"
		placeholder="Your Deepgram API Key"
		autocomplete="off"
		bind:value={
			() => settings.value['apiKeys.deepgram'],
			(value) => settings.updateKey('apiKeys.deepgram', value)
		}
	/>
	<Field.Description>
		You can find your API key in your <Link
			href="https://console.deepgram.com/project"
			target="_blank"
			rel="noopener noreferrer"
		>
			Deepgram Console
		</Link>. Make sure you have <Link
			href="https://console.deepgram.com/billing"
			target="_blank"
			rel="noopener noreferrer"
		>
			credits
		</Link>
		available.
	</Field.Description>
</Field.Field>
