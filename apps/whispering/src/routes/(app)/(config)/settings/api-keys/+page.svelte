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
</script>

<svelte:head>
	<title>API Keys - Whispering</title>
</svelte:head>

<Field.Set>
	<Field.Legend>API Keys</Field.Legend>
	<Field.Description>
		Configure your API keys for Whispering.
	</Field.Description>
	<Field.Separator />
	<Field.Group>
		<!-- Multi-purpose services (transcription + transformation) -->
		<OpenAiApiKeyInput />
		<Field.Separator />
		<GroqApiKeyInput />
		<Field.Separator />
		<MistralApiKeyInput />

		<Field.Separator />

		<!-- Transcription-focused services -->
		<DeepgramApiKeyInput />
		<Field.Separator />
		<ElevenLabsApiKeyInput />

		<Field.Separator />

		<!-- Transformation-focused services -->
		<AnthropicApiKeyInput />
		<Field.Separator />
		<OpenRouterApiKeyInput />
		<Field.Separator />
		<GoogleApiKeyInput />

		<Field.Separator />

		<!-- Custom endpoints -->
		<CustomEndpointInput />
	</Field.Group>
</Field.Set>
