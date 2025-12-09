<script lang="ts">
	import {
		AnthropicApiKeyInput,
		ElevenLabsApiKeyInput,
		GoogleApiKeyInput,
		GroqApiKeyInput,
		MistralApiKeyInput,
		DeepgramApiKeyInput,
		OpenAiApiKeyInput,
		OpenRouterApiKeyInput,
		CustomEndpointInput,
	} from '$lib/components/settings';
	import * as Field from '@epicenter/ui/field';
	import { Separator } from '@epicenter/ui/separator';
</script>

<svelte:head>
	<title>API Keys - Whispering</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h3 class="text-lg font-medium">API Keys</h3>
		<p class="text-muted-foreground text-sm">
			Configure your API keys for Whispering.
		</p>
	</div>

	<Separator />

	<Field.Group>
		<!-- Multi-purpose services (transcription + transformation) -->
		<OpenAiApiKeyInput />
		<GroqApiKeyInput />
		<MistralApiKeyInput />

		<!-- Transcription-focused services -->
		<DeepgramApiKeyInput />
		<ElevenLabsApiKeyInput />

		<!-- Transformation-focused services -->
		<AnthropicApiKeyInput />
		<OpenRouterApiKeyInput />
		<GoogleApiKeyInput />

		<Field.Separator />

		<!-- Custom endpoints -->
		<CustomEndpointInput />
	</Field.Group>
</div>
