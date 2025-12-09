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

<Field.Group>
	<Field.Field>
		<Field.Label for="openai-api-key" class="flex items-center gap-2">
			OpenAI API Key
			{#if showBadges}
				{#each capabilities as capability}
					<Badge variant="secondary" class="text-xs">{capability}</Badge>
				{/each}
			{/if}
		</Field.Label>
		<Input
			id="openai-api-key"
			type="password"
			placeholder="Your OpenAI API Key"
			autocomplete="off"
			bind:value={
				() => settings.value['apiKeys.openai'],
				(value) => settings.updateKey('apiKeys.openai', value)
			}
		/>
		<Field.Description>
			You can find your API key in your <Link
				href="https://platform.openai.com/api-keys"
				target="_blank"
				rel="noopener noreferrer"
			>
				account settings
			</Link>. Make sure <Link
				href="https://platform.openai.com/settings/organization/billing/overview"
				target="_blank"
				rel="noopener noreferrer"
			>
				billing
			</Link>
			is enabled.
		</Field.Description>
	</Field.Field>

	<Field.Field>
		<Field.Label for="openai-base-url">Custom Base URL (Optional)</Field.Label>
		<Input
			id="openai-base-url"
			type="url"
			placeholder="https://api.openai.com/v1 (default)"
			autocomplete="off"
			bind:value={
				() => settings.value['apiEndpoints.openai'],
				(value) => settings.updateKey('apiEndpoints.openai', value)
			}
		/>
		<Field.Description>
			Override the default OpenAI API endpoint. Useful for reverse proxies or
			OpenAI-compatible services. Leave empty to use the official OpenAI API.
		</Field.Description>
	</Field.Field>
</Field.Group>
