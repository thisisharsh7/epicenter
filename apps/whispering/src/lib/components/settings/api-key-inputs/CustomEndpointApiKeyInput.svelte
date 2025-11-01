<script lang="ts">
	import { LabeledInput } from '$lib/components/labeled/index.js';
	import { settings } from '$lib/stores/settings.svelte';
</script>

<LabeledInput
	id="custom-endpoint-api-key"
	label="API Key (Optional)"
	type="password"
	placeholder="Leave empty if not required"
	bind:value={
		() => settings.value['apiKeys.customEndpoint'],
		(value) => settings.updateKey('apiKeys.customEndpoint', value)
	}
>
	{#snippet description()}
		<p class="text-muted-foreground text-sm">
			Most local inference servers (Ollama, LM Studio, llama.cpp) don't require
			an API key. Only enter a key if your endpoint requires authentication.
		</p>
	{/snippet}
</LabeledInput>
