<script lang="ts">
	import { LabeledInput } from '$lib/components/labeled/index.js';
	import { settings } from '$lib/stores/settings.svelte';

	type Props = {
		showBaseUrl?: boolean;
	};

	let { showBaseUrl = true }: Props = $props();
</script>

<div class="space-y-4">
	{#if showBaseUrl}
		<LabeledInput
			id="custom-endpoint-base-url"
			label="Custom API Base URL"
			placeholder="e.g. http://localhost:11434/v1"
			bind:value={
				() => settings.value['completion.custom.baseUrl'],
				(value) => settings.updateKey('completion.custom.baseUrl', value)
			}
		>
			{#snippet description()}
				<p class="text-muted-foreground text-sm">
					Global default URL for OpenAI-compatible endpoints (Ollama, LM Studio,
					llama.cpp, etc.). Can be overridden per-step in transformations.
				</p>
			{/snippet}
		</LabeledInput>
	{/if}

	<LabeledInput
		id="custom-endpoint-api-key"
		label="Custom API Key"
		type="password"
		placeholder="Leave empty if not required"
		bind:value={
			() => settings.value['apiKeys.custom'],
			(value) => settings.updateKey('apiKeys.custom', value)
		}
	>
		{#snippet description()}
			<p class="text-muted-foreground text-sm">
				Most local endpoints don't require authentication. Only enter a key if
				your endpoint requires it.
			</p>
		{/snippet}
	</LabeledInput>
</div>
