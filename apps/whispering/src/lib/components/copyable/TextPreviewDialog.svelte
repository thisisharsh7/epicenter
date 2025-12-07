<script lang="ts">
	import { ClipboardIcon } from '$lib/components/icons';
	import { rpc } from '$lib/query';
	import { Button } from '@epicenter/ui/button';
	import * as Dialog from '@epicenter/ui/dialog';
	import * as InputGroup from '@epicenter/ui/input-group';
	import { Spinner } from '@epicenter/ui/spinner';
	import { Textarea } from '@epicenter/ui/textarea';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import { createMutation } from '@tanstack/svelte-query';

	/**
	 * A generic text preview component that displays text in a readonly textarea
	 * with an inline copy button. Clicking the textarea opens a dialog with the
	 * full text and copy functionality.
	 *
	 * Uses InputGroup for integrated styling of the textarea and action buttons.
	 *
	 * @example
	 * ```svelte
	 * <TextPreviewDialog
	 *   id="transcription-1"
	 *   title="Transcript"
	 *   text={transcriptionResult}
	 *   label="transcription"
	 *   rows={1}
	 * />
	 * ```
	 *
	 * @example
	 * ```svelte
	 * <TextPreviewDialog
	 *   id="loading-1"
	 *   title="Transcript"
	 *   text="..."
	 *   label="transcript"
	 *   loading={true}
	 * />
	 * ```
	 */
	let {
		/** Unique identifier for view transitions */
		id,
		/** The title displayed in the dialog header (capitalized) */
		title,
		/** The text content to display and copy */
		text,
		/** Label used for accessibility (lowercase) */
		label,
		/** Number of rows for the preview textarea */
		rows = 2,
		/** Whether the component is disabled */
		disabled = false,
		/** Whether to show a loading spinner instead of copy button */
		loading = false,
	}: {
		id: string;
		title: string;
		text: string;
		label: string;
		rows?: number;
		disabled?: boolean;
		loading?: boolean;
	} = $props();

	let isDialogOpen = $state(false);
	let showCopiedCheck = $state(false);

	const copyToClipboard = createMutation(rpc.text.copyToClipboard.options);

	function handleCopy() {
		copyToClipboard.mutate(
			{ text },
			{
				onSuccess: () => {
					showCopiedCheck = true;
					setTimeout(() => (showCopiedCheck = false), 2000);
					rpc.notify.success.execute({
						title: `Copied ${title.toLowerCase()} to clipboard!`,
						description: text,
					});
				},
				onError: (error) => {
					rpc.notify.error.execute({
						title: `Error copying ${title.toLowerCase()} to clipboard`,
						description: error.message,
						action: { type: 'more-details', error },
					});
				},
			},
		);
	}

	function handleCopyAndClose() {
		copyToClipboard.mutate(
			{ text },
			{
				onSuccess: () => {
					isDialogOpen = false;
					rpc.notify.success.execute({
						title: `Copied ${title.toLowerCase()} to clipboard!`,
						description: text,
					});
				},
				onError: (error) => {
					rpc.notify.error.execute({
						title: `Error copying ${title.toLowerCase()} to clipboard`,
						description: error.message,
						action: { type: 'more-details', error },
					});
				},
			},
		);
	}
</script>

<Dialog.Root bind:open={isDialogOpen}>
	<InputGroup.Root data-disabled={disabled || loading}>
		<Dialog.Trigger {id} disabled={disabled || loading} class="flex-1 min-w-0">
			{#snippet child({ props })}
				<textarea
					{...props}
					data-slot="input-group-control"
					class="flex-1 min-w-0 resize-none rounded-none border-0 bg-transparent py-2 px-3 shadow-none focus-visible:ring-0 focus:outline-none dark:bg-transparent text-sm leading-snug hover:cursor-pointer hover:bg-accent/50 transition-colors min-h-0"
					readonly
					value={text}
					style="view-transition-name: {id}"
					{rows}
					{disabled}
					aria-label="Click to view {label}"
				></textarea>
			{/snippet}
		</Dialog.Trigger>
		<InputGroup.Addon align="inline-end">
			{#if loading}
				<Spinner />
			{:else}
				<InputGroup.Button
					size="icon-xs"
					disabled={disabled || !text.trim()}
					aria-label="Copy {label}"
					onclick={(e) => {
						e.stopPropagation();
						handleCopy();
					}}
				>
					{#if showCopiedCheck}
						<CheckIcon />
					{:else}
						<CopyIcon />
					{/if}
				</InputGroup.Button>
			{/if}
		</InputGroup.Addon>
	</InputGroup.Root>
	<Dialog.Content class="max-w-4xl">
		<Dialog.Title>{title}</Dialog.Title>
		<Textarea readonly value={text} rows={20} />
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (isDialogOpen = false)}>
				Close
			</Button>
			<Button variant="outline" onclick={handleCopyAndClose}>
				<ClipboardIcon class="size-4" />
				Copy Text
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
