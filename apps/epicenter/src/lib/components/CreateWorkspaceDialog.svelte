<script module lang="ts">
	import { toKebabCase } from '$lib/utils/slug';

	function createWorkspaceDialogState() {
		let isOpen = $state(false);
		let isPending = $state(false);
		let name = $state('');
		let slug = $state('');
		let isSlugManuallyEdited = $state(false);
		let error = $state<string | null>(null);
		let onConfirm = $state<
			((data: { name: string; slug: string }) => void | Promise<unknown>) | null
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
				if (!isSlugManuallyEdited) {
					slug = toKebabCase(value);
				}
			},
			get slug() {
				return slug;
			},
			set slug(value) {
				slug = value;
				error = null;
				isSlugManuallyEdited = true;
			},
			get isSlugManuallyEdited() {
				return isSlugManuallyEdited;
			},
			get error() {
				return error;
			},

			open(opts: {
				onConfirm: (data: {
					name: string;
					slug: string;
				}) => void | Promise<unknown>;
			}) {
				onConfirm = opts.onConfirm;
				isPending = false;
				name = '';
				slug = '';
				error = null;
				isSlugManuallyEdited = false;
				isOpen = true;
			},

			close() {
				isOpen = false;
				isPending = false;
				name = '';
				slug = '';
				error = null;
				isSlugManuallyEdited = false;
				onConfirm = null;
			},

			resetSlug() {
				slug = toKebabCase(name);
				error = null;
				isSlugManuallyEdited = false;
			},

			get canConfirm() {
				return name.trim().length > 0 && slug.trim().length > 0;
			},

			async confirm() {
				if (!onConfirm) return;
				if (!name.trim() || !slug.trim()) return;

				error = null;
				const finalSlug = toKebabCase(slug.trim());
				const result = onConfirm({ name: name.trim(), slug: finalSlug });

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
						<Label for="workspace-slug">
							Workspace ID
							{#if !createWorkspaceDialog.isSlugManuallyEdited && createWorkspaceDialog.slug}
								<span class="text-muted-foreground ml-2 text-xs font-normal"
									>(auto-generated)</span
								>
							{/if}
						</Label>
						{#if createWorkspaceDialog.isSlugManuallyEdited}
							<Button
								type="button"
								variant="ghost"
								size="sm"
								class="h-6 px-2 text-xs"
								onclick={() => createWorkspaceDialog.resetSlug()}
								disabled={createWorkspaceDialog.isPending}
							>
								<RotateCcwIcon class="mr-1 size-3" />
								Reset
							</Button>
						{/if}
					</div>
					<Input
						id="workspace-slug"
						bind:value={createWorkspaceDialog.slug}
						placeholder="my-workspace"
						disabled={createWorkspaceDialog.isPending}
						class="font-mono text-sm"
						aria-invalid={!!createWorkspaceDialog.error}
					/>
					{#if createWorkspaceDialog.error}
						<Field.Error>{createWorkspaceDialog.error}</Field.Error>
					{:else}
						<Field.Description>
							This will be used in URLs and file names.
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
