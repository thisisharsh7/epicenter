<script module lang="ts">
	import * as slugify from '$lib/utils/slugify';

	export type NameIdDialogConfig = {
		title: string;
		description: string;
		nameLabel?: string;
		namePlaceholder?: string;
		idLabel?: string;
		idPlaceholder?: string;
		idDescription?: string;
		confirmText?: string;
		cancelText?: string;
		onConfirm: (data: { name: string; id: string }) => void | Promise<unknown>;
	};

	function createNameIdDialog() {
		let isOpen = $state(false);
		let isPending = $state(false);
		let name = $state('');
		let id = $state('');
		let isIdManuallyEdited = $state(false);
		let error = $state<string | null>(null);
		let config = $state<NameIdDialogConfig | null>(null);

		return {
			get isOpen() {
				return isOpen;
			},
			set isOpen(value) {
				isOpen = value;
			},
			get isPending() {
				return isPending;
			},
			get name() {
				return name;
			},
			set name(value) {
				name = value;
				error = null;
				if (!isIdManuallyEdited) {
					id = slugify.toSnakeCase(value);
				}
			},
			get id() {
				return id;
			},
			set id(value) {
				id = value;
				error = null;
				isIdManuallyEdited = true;
			},
			get isIdManuallyEdited() {
				return isIdManuallyEdited;
			},
			get error() {
				return error;
			},
			get config() {
				return config;
			},

			open(opts: NameIdDialogConfig) {
				config = opts;
				isPending = false;
				name = '';
				id = '';
				error = null;
				isIdManuallyEdited = false;
				isOpen = true;
			},

			close() {
				isOpen = false;
				isPending = false;
				name = '';
				id = '';
				error = null;
				isIdManuallyEdited = false;
				config = null;
			},

			resetId() {
				id = slugify.toSnakeCase(name);
				error = null;
				isIdManuallyEdited = false;
			},

			get canConfirm() {
				return name.trim().length > 0 && id.trim().length > 0;
			},

			async confirm() {
				if (!config) return;
				if (!name.trim() || !id.trim()) return;

				error = null;
				const result = config.onConfirm({ name: name.trim(), id: id.trim() });

				if (result instanceof Promise) {
					isPending = true;
					try {
						await result;
						isOpen = false;
					} catch (e) {
						error =
							e instanceof Error
								? e.message
								: typeof e === 'object' && e !== null && 'message' in e
									? String((e as { message: unknown }).message)
									: 'An error occurred';
					} finally {
						isPending = false;
					}
				} else {
					isOpen = false;
				}
			},

			cancel() {
				isOpen = false;
			},
		};
	}

	export const nameIdDialog = createNameIdDialog();
</script>

<script lang="ts">
	import * as Dialog from '@epicenter/ui/dialog';
	import * as Field from '@epicenter/ui/field';
	import { Input } from '@epicenter/ui/input';
	import { Button } from '@epicenter/ui/button';
	import { Label } from '@epicenter/ui/label';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
</script>

<Dialog.Root bind:open={nameIdDialog.isOpen}>
	<Dialog.Content class="sm:max-w-md">
		<form
			method="POST"
			onsubmit={(e) => {
				e.preventDefault();
				nameIdDialog.confirm();
			}}
			class="flex flex-col gap-4"
		>
			<Dialog.Header>
				<Dialog.Title>{nameIdDialog.config?.title}</Dialog.Title>
				<Dialog.Description>
					{nameIdDialog.config?.description}
				</Dialog.Description>
			</Dialog.Header>

			<div class="grid gap-4">
				<Field.Field>
					<Label for="name-id-name">
						{nameIdDialog.config?.nameLabel ?? 'Name'}
					</Label>
					<Input
						id="name-id-name"
						bind:value={nameIdDialog.name}
						placeholder={nameIdDialog.config?.namePlaceholder ?? 'Enter name'}
						disabled={nameIdDialog.isPending}
					/>
				</Field.Field>

				<Field.Field>
					<div class="flex items-center justify-between">
						<Label for="name-id-id">
							{nameIdDialog.config?.idLabel ?? 'ID'}
							{#if !nameIdDialog.isIdManuallyEdited && nameIdDialog.id}
								<span class="text-muted-foreground ml-2 text-xs font-normal">
									(auto-generated)
								</span>
							{/if}
						</Label>
						{#if nameIdDialog.isIdManuallyEdited}
							<Button
								type="button"
								variant="ghost"
								size="sm"
								class="h-6 px-2 text-xs"
								onclick={() => nameIdDialog.resetId()}
								disabled={nameIdDialog.isPending}
							>
								<RotateCcwIcon class="mr-1 size-3" />
								Reset
							</Button>
						{/if}
					</div>
					<Input
						id="name-id-id"
						bind:value={nameIdDialog.id}
						placeholder={nameIdDialog.config?.idPlaceholder ?? 'auto-generated'}
						disabled={nameIdDialog.isPending}
						class="font-mono text-sm"
						aria-invalid={!!nameIdDialog.error}
					/>
					{#if nameIdDialog.error}
						<Field.Error>{nameIdDialog.error}</Field.Error>
					{:else if nameIdDialog.config?.idDescription}
						<Field.Description>
							{nameIdDialog.config.idDescription}
						</Field.Description>
					{/if}
				</Field.Field>
			</div>

			<Dialog.Footer>
				<Button
					type="button"
					variant="outline"
					onclick={() => nameIdDialog.cancel()}
					disabled={nameIdDialog.isPending}
				>
					{nameIdDialog.config?.cancelText ?? 'Cancel'}
				</Button>
				<Button
					type="submit"
					disabled={nameIdDialog.isPending || !nameIdDialog.canConfirm}
				>
					{nameIdDialog.config?.confirmText ?? 'Create'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
