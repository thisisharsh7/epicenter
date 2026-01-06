<script lang="ts">
	import { page } from '$app/state';
	import * as Card from '@epicenter/ui/card';
	import { Badge } from '@epicenter/ui/badge';
	import { Button } from '@epicenter/ui/button';
	import { Input } from '@epicenter/ui/input';
	import { Textarea } from '@epicenter/ui/textarea';
	import { Switch } from '@epicenter/ui/switch';
	import { Label } from '@epicenter/ui/label';

	const workspaceId = $derived(page.params.id);
	const settingKey = $derived(page.params.key);

	// Mock data - will be replaced with actual data fetching
	const mockSettings: Record<string, { value: unknown; description?: string }> =
		{
			'api-config': {
				value: { baseUrl: 'https://api.example.com', timeout: 30000 },
				description: 'API configuration for external services',
			},
			'feature-flags': {
				value: { betaAccess: true, maxUsers: 100, darkMode: false },
				description: 'Feature flags for the application',
			},
		};

	const setting = $derived(settingKey ? mockSettings[settingKey] : undefined);
	const originalValue = $derived(setting?.value);

	// Detect value type
	function getValueType(value: unknown): 'boolean' | 'json' | 'string' {
		if (typeof value === 'boolean') return 'boolean';
		if (typeof value === 'object' && value !== null) return 'json';
		return 'string';
	}

	const valueType = $derived(getValueType(originalValue));

	// Local state for editing
	let editedStringValue = $state('');
	let editedBooleanValue = $state(false);
	let jsonError = $state<string | null>(null);

	// Initialize edited values when setting changes
	$effect(() => {
		if (originalValue !== undefined) {
			if (valueType === 'boolean') {
				editedBooleanValue = originalValue as boolean;
			} else if (valueType === 'json') {
				editedStringValue = JSON.stringify(originalValue, null, 2);
			} else {
				editedStringValue = String(originalValue);
			}
		}
	});

	// Validate JSON
	$effect(() => {
		if (valueType === 'json') {
			try {
				JSON.parse(editedStringValue);
				jsonError = null;
			} catch {
				jsonError = 'Invalid JSON';
			}
		}
	});

	// Check if value has changed
	const isDirty = $derived.by(() => {
		if (valueType === 'boolean') {
			return editedBooleanValue !== originalValue;
		}
		if (valueType === 'json') {
			try {
				const parsed = JSON.parse(editedStringValue);
				return JSON.stringify(parsed) !== JSON.stringify(originalValue);
			} catch {
				return true;
			}
		}
		return editedStringValue !== String(originalValue);
	});

	const canSave = $derived(isDirty && !jsonError);

	function handleSave() {
		// TODO: Implement save functionality
		console.log('Saving:', {
			key: settingKey,
			value:
				valueType === 'boolean'
					? editedBooleanValue
					: valueType === 'json'
						? JSON.parse(editedStringValue)
						: editedStringValue,
		});
	}

	function handleCancel() {
		// Reset to original values
		if (valueType === 'boolean') {
			editedBooleanValue = originalValue as boolean;
		} else if (valueType === 'json') {
			editedStringValue = JSON.stringify(originalValue, null, 2);
		} else {
			editedStringValue = String(originalValue);
		}
	}

	function handleDelete() {
		// TODO: Implement delete with confirmation
		console.log('Delete:', settingKey);
	}
</script>

<div class="space-y-6">
	<div class="flex items-center gap-2 text-sm">
		<a href="/" class="text-muted-foreground hover:text-foreground"
			>Workspaces</a
		>
		<span class="text-muted-foreground">/</span>
		<a
			href="/workspaces/{workspaceId}"
			class="text-muted-foreground hover:text-foreground"
		>
			{workspaceId}
		</a>
		<span class="text-muted-foreground">/</span>
		<span class="text-muted-foreground">Settings</span>
		<span class="text-muted-foreground">/</span>
		<span class="font-medium">{settingKey}</span>
	</div>

	{#if !setting}
		<div class="rounded-lg border border-destructive bg-destructive/10 p-4">
			<p class="text-destructive font-medium">Setting not found</p>
			<p class="text-destructive/80 text-sm">
				The setting "{settingKey}" does not exist in this workspace.
			</p>
		</div>
	{:else}
		<Card.Root class="max-w-3xl">
			<Card.Header>
				<div class="flex items-center justify-between">
					<Card.Title class="text-xl">{settingKey}</Card.Title>
					<Badge variant="secondary">{valueType.toUpperCase()}</Badge>
				</div>
				{#if setting.description}
					<Card.Description>{setting.description}</Card.Description>
				{/if}
			</Card.Header>

			<Card.Content class="space-y-4">
				{#if valueType === 'boolean'}
					<div class="flex items-center gap-4 rounded-md border p-4">
						<Switch bind:checked={editedBooleanValue} id="value-switch" />
						<Label for="value-switch" class="text-sm font-medium">
							{editedBooleanValue ? 'Enabled' : 'Disabled'}
						</Label>
					</div>
				{:else if valueType === 'json'}
					<div class="space-y-2">
						<Label for="value-textarea">Value</Label>
						<Textarea
							id="value-textarea"
							bind:value={editedStringValue}
							class="min-h-[300px] font-mono text-sm"
							placeholder="Enter JSON value..."
						/>
						{#if jsonError}
							<p class="text-destructive text-sm">{jsonError}</p>
						{/if}
					</div>
				{:else}
					<div class="space-y-2">
						<Label for="value-input">Value</Label>
						<Input
							id="value-input"
							bind:value={editedStringValue}
							placeholder="Enter value..."
						/>
					</div>
				{/if}

				<p class="text-muted-foreground text-xs">Last modified: 2 hours ago</p>
			</Card.Content>

			<Card.Footer class="flex justify-between">
				<Button variant="destructive" onclick={handleDelete}>Delete</Button>
				<div class="flex gap-2">
					<Button variant="outline" onclick={handleCancel} disabled={!isDirty}>
						Cancel
					</Button>
					<Button onclick={handleSave} disabled={!canSave}>Save Changes</Button>
				</div>
			</Card.Footer>
		</Card.Root>
	{/if}
</div>
