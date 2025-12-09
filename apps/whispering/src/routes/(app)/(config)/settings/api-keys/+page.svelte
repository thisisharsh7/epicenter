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
		<OpenAiApiKeyInput showBadges />
		<Field.Separator />
		<GroqApiKeyInput showBadges />
		<Field.Separator />
		<MistralApiKeyInput showBadges />

		<Field.Separator />

		<!-- Transcription-focused services -->
		<DeepgramApiKeyInput showBadges />
		<Field.Separator />
		<ElevenLabsApiKeyInput showBadges />

		<Field.Separator />

		<!-- Transformation-focused services -->
		<AnthropicApiKeyInput showBadges />
		<Field.Separator />
		<OpenRouterApiKeyInput showBadges />
		<Field.Separator />
		<GoogleApiKeyInput showBadges />

		<Field.Separator />

		<!-- Custom endpoints -->
		<CustomEndpointInput showBadges />
	</Field.Group>
</Field.Set>
