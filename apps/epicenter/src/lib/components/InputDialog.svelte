<script module lang="ts">
	export type InputDialogOptions = {
		title: string;
		description: string;
		label?: string;
		placeholder?: string;
		defaultValue?: string;
		confirm?: {
			text?: string;
		};
		cancel?: {
			text?: string;
		};
		onConfirm: (value: string) => void | Promise<unknown>;
		onCancel?: () => void;
	};

	function createInputDialog() {
		let isOpen = $state(false);
		let isPending = $state(false);
		let inputValue = $state('');
		let options = $state<InputDialogOptions | null>(null);

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
			get inputValue() {
				return inputValue;
			},
			set inputValue(value) {
				inputValue = value;
			},
			get options() {
				return options;
			},

			open(opts: InputDialogOptions) {
				options = opts;
				isPending = false;
				inputValue = opts.defaultValue ?? '';
				isOpen = true;
			},

			close() {
				isOpen = false;
				isPending = false;
				inputValue = '';
				options = null;
			},

			get canConfirm() {
				return inputValue.trim().length > 0;
			},

			async confirm() {
				if (!options) return;
				if (!inputValue.trim()) return;

				const result = options.onConfirm(inputValue.trim());

				if (result instanceof Promise) {
					isPending = true;
					try {
						await result;
						isOpen = false;
					} catch {
						// Keep dialog open on error
					} finally {
						isPending = false;
					}
				} else {
					isOpen = false;
				}
			},

			cancel() {
				options?.onCancel?.();
				isOpen = false;
			},
		};
	}

	export const inputDialog = createInputDialog();
</script>

<script lang="ts">
	import * as Dialog from '@epicenter/ui/dialog';
	import { Input } from '@epicenter/ui/input';
	import { Button } from '@epicenter/ui/button';
	import { Label } from '@epicenter/ui/label';
</script>

<Dialog.Root bind:open={inputDialog.isOpen}>
	<Dialog.Content class="sm:max-w-md">
		<form
			method="POST"
			onsubmit={(e) => {
				e.preventDefault();
				inputDialog.confirm();
			}}
			class="flex flex-col gap-4"
		>
			<Dialog.Header>
				<Dialog.Title>{inputDialog.options?.title}</Dialog.Title>
				<Dialog.Description>
					{inputDialog.options?.description}
				</Dialog.Description>
			</Dialog.Header>

			<div class="grid gap-2">
				{#if inputDialog.options?.label}
					<Label for="input-dialog-input">{inputDialog.options.label}</Label>
				{/if}
				<Input
					id="input-dialog-input"
					bind:value={inputDialog.inputValue}
					placeholder={inputDialog.options?.placeholder ?? ''}
					disabled={inputDialog.isPending}
				/>
			</div>

			<Dialog.Footer>
				<Button
					type="button"
					variant="outline"
					onclick={inputDialog.cancel}
					disabled={inputDialog.isPending}
				>
					{inputDialog.options?.cancel?.text ?? 'Cancel'}
				</Button>
				<Button
					type="submit"
					disabled={inputDialog.isPending || !inputDialog.canConfirm}
				>
					{inputDialog.options?.confirm?.text ?? 'Create'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
