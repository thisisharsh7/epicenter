<script lang="ts">
	import * as Field from '@repo/ui/field';
	import { Input } from '@repo/ui/input';
	import { Link } from '@repo/ui/link';
	import { settings } from '$lib/stores/settings.svelte';
</script>

<Field.Field>
	<Field.Label for="groq-api-key">Groq API Key</Field.Label>
	<Input
		id="groq-api-key"
		type="password"
		placeholder="Your Groq API Key"
		autocomplete="off"
		bind:value={
			() => settings.value['apiKeys.groq'],
			(value) => settings.updateKey('apiKeys.groq', value)
		}
	/>
	<Field.Description>
		You can find your Groq API key in your <Link
			href="https://console.groq.com/keys"
			target="_blank"
			rel="noopener noreferrer"
		>
			Groq console
		</Link>.
	</Field.Description>
</Field.Field>
