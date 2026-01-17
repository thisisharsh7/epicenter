<script module lang="ts">
	import { toKebabCase } from '$lib/utils/slug';

	function createWorkspaceDialogState() {
		let isOpen = $state(false);
		let isPending = $state(false);
		let name = $state('');
		let id = $state('');
		let isIdManuallyEdited = $state(false);
		let error = $state<string | null>(null);
		let onConfirm = $state<
			((data: { name: string; id: string }) => void | Promise<unknown>) | null
		>(null);

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
					id = toKebabCase(value);
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

			open(opts: {
				onConfirm: (data: {
					name: string;
					id: string;
				}) => void | Promise<unknown>;
			}) {
				onConfirm = opts.onConfirm;
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
				onConfirm = null;
			},

			resetId() {
				id = toKebabCase(name);
				error = null;
				isIdManuallyEdited = false;
			},

			get canConfirm() {
				return name.trim().length > 0 && id.trim().length > 0;
			},

			async confirm() {
				if (!onConfirm) return;
				if (!name.trim() || !id.trim()) return;

				error = null;
				const finalId = toKebabCase(id.trim());
				const result = onConfirm({ name: name.trim(), id: finalId });

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
									: 'Failed to create workspace';
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

	export const createWorkspaceDialog = createWorkspaceDialogState();
</script>

<script lang="ts">
	import * as Dialog from '@epicenter/ui/dialog';
	import * as Field from '@epicenter/ui/field';
	import { Input } from '@epicenter/ui/input';
	import { Button } from '@epicenter/ui/button';
	import { Label } from '@epicenter/ui/label';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
</script>

<Dialog.Root bind:open={createWorkspaceDialog.isOpen}>
	<Dialog.Content class="sm:max-w-md">
		<form
			method="POST"
			onsubmit={(e) => {
				e.preventDefault();
				createWorkspaceDialog.confirm();
			}}
			class="flex flex-col gap-4"
		>
			<Dialog.Header>
				<Dialog.Title>Create Workspace</Dialog.Title>
				<Dialog.Description>
					Enter a name for your new workspace. The ID will be auto-generated
					from the name.
				</Dialog.Description>
			</Dialog.Header>

			<div class="grid gap-4">
				<Field.Field>
					<Label for="workspace-name">Workspace Name</Label>
					<Input
						id="workspace-name"
						bind:value={createWorkspaceDialog.name}
						placeholder="My Workspace"
						disabled={createWorkspaceDialog.isPending}
					/>
				</Field.Field>

				<Field.Field>
					<div class="flex items-center justify-between">
						<Label for="workspace-id">
							Workspace ID
							{#if !createWorkspaceDialog.isIdManuallyEdited && createWorkspaceDialog.id}
								<span class="text-muted-foreground ml-2 text-xs font-normal"
									>(auto-generated)</span
								>
							{/if}
						</Label>
						{#if createWorkspaceDialog.isIdManuallyEdited}
							<Button
								type="button"
								variant="ghost"
								size="sm"
								class="h-6 px-2 text-xs"
								onclick={() => createWorkspaceDialog.resetId()}
								disabled={createWorkspaceDialog.isPending}
							>
								<RotateCcwIcon class="mr-1 size-3" />
								Reset
							</Button>
						{/if}
					</div>
					<Input
						id="workspace-id"
						bind:value={createWorkspaceDialog.id}
						placeholder="my-workspace"
						disabled={createWorkspaceDialog.isPending}
						class="font-mono text-sm"
						aria-invalid={!!createWorkspaceDialog.error}
					/>
					{#if createWorkspaceDialog.error}
						<Field.Error>{createWorkspaceDialog.error}</Field.Error>
					{:else}
						<Field.Description>
							Used in URLs and file paths. Cannot be changed later.
						</Field.Description>
					{/if}
				</Field.Field>
			</div>

			<Dialog.Footer>
				<Button
					type="button"
					variant="outline"
					onclick={() => createWorkspaceDialog.cancel()}
					disabled={createWorkspaceDialog.isPending}
				>
					Cancel
				</Button>
				<Button
					type="submit"
					disabled={createWorkspaceDialog.isPending ||
						!createWorkspaceDialog.canConfirm}
				>
					Create
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
