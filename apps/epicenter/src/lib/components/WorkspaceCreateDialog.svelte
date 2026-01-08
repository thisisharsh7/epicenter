<script module lang="ts">
	import * as slugify from '$lib/utils/slugify';

	function createWorkspaceCreateDialog() {
		let isOpen = $state(false);
		let isPending = $state(false);
		let name = $state('');
		let slug = $state('');
		let isSlugManuallyEdited = $state(false);
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
				if (!isSlugManuallyEdited) {
					slug = slugify.toKebabCase(value);
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
					id: string;
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
				slug = slugify.toKebabCase(name);
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
				const finalId = slugify.toKebabCase(slug.trim());
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

	export const workspaceCreateDialog = createWorkspaceCreateDialog();
</script>

<script lang="ts">
	import * as Dialog from '@epicenter/ui/dialog';
	import * as Field from '@epicenter/ui/field';
	import { Input } from '@epicenter/ui/input';
	import { Button } from '@epicenter/ui/button';
	import { Label } from '@epicenter/ui/label';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
</script>

<Dialog.Root bind:open={workspaceCreateDialog.isOpen}>
	<Dialog.Content class="sm:max-w-md">
		<form
			method="POST"
			onsubmit={(e) => {
				e.preventDefault();
				workspaceCreateDialog.confirm();
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
						bind:value={workspaceCreateDialog.name}
						placeholder="My Workspace"
						disabled={workspaceCreateDialog.isPending}
					/>
				</Field.Field>

				<Field.Field>
					<div class="flex items-center justify-between">
						<Label for="workspace-slug">
							Workspace ID
							{#if !workspaceCreateDialog.isSlugManuallyEdited && workspaceCreateDialog.slug}
								<span class="text-muted-foreground ml-2 text-xs font-normal"
									>(auto-generated)</span
								>
							{/if}
						</Label>
						{#if workspaceCreateDialog.isSlugManuallyEdited}
							<Button
								type="button"
								variant="ghost"
								size="sm"
								class="h-6 px-2 text-xs"
								onclick={() => workspaceCreateDialog.resetSlug()}
								disabled={workspaceCreateDialog.isPending}
							>
								<RotateCcwIcon class="mr-1 size-3" />
								Reset
							</Button>
						{/if}
					</div>
					<Input
						id="workspace-slug"
						bind:value={workspaceCreateDialog.slug}
						placeholder="my-workspace"
						disabled={workspaceCreateDialog.isPending}
						class="font-mono text-sm"
						aria-invalid={!!workspaceCreateDialog.error}
					/>
					{#if workspaceCreateDialog.error}
						<Field.Error>{workspaceCreateDialog.error}</Field.Error>
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
					onclick={() => workspaceCreateDialog.cancel()}
					disabled={workspaceCreateDialog.isPending}
				>
					Cancel
				</Button>
				<Button
					type="submit"
					disabled={workspaceCreateDialog.isPending ||
						!workspaceCreateDialog.canConfirm}
				>
					Create
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
