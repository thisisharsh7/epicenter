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

	const capabilities = ['Transcription', 'Transformation'] as const;
</script>

<Field.Field>
	<Field.Label for="mistral-api-key" class="flex items-center gap-2">
		Mistral AI API Key
		{#if showBadges}
			{#each capabilities as capability}
				<Badge variant="secondary" class="text-xs">{capability}</Badge>
			{/each}
		{/if}
	</Field.Label>
	<Input
		id="mistral-api-key"
		type="password"
		placeholder="Your Mistral AI API Key"
		autocomplete="off"
		bind:value={
			() => settings.value['apiKeys.mistral'],
			(value) => settings.updateKey('apiKeys.mistral', value)
		}
	/>
	<Field.Description>
		You can find your API key in your <Link
			href="https://console.mistral.ai/api-keys/"
			target="_blank"
			rel="noopener noreferrer"
		>
			Mistral console
		</Link>. Voxtral transcription is priced at <Link
			href="https://mistral.ai/pricing#api-pricing"
			target="_blank"
			rel="noopener noreferrer"
		>
			$0.12/hour
		</Link>
		of audio.
	</Field.Description>
</Field.Field>
