<script lang="ts">
	import * as Field from '@repo/ui/field';
	import { Input } from '@repo/ui/input';
	import { Link } from '@repo/ui/link';
	import { settings } from '$lib/stores/settings.svelte';
</script>

<Field.Field>
	<Field.Label for="openai-api-key">OpenAI API Key</Field.Label>
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
