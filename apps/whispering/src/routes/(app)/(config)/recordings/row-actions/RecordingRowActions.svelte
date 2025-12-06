<script lang="ts">
	import { confirmationDialog } from '$lib/components/ConfirmationDialog.svelte';
	import { Button } from '@epicenter/ui/button';
	import * as Tooltip from '@epicenter/ui/tooltip';
	import CopyToClipboardButton from '$lib/components/copyable/CopyToClipboardButton.svelte';
	import { ClipboardIcon, TrashIcon } from '$lib/components/icons';
	import { Skeleton } from '@epicenter/ui/skeleton';
	import { rpc } from '$lib/query';
	import { getRecordingTransitionId } from '$lib/utils/getRecordingTransitionId';
	import { createMutation, createQuery } from '@tanstack/svelte-query';
	import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import FileStackIcon from '@lucide/svelte/icons/file-stack';
	import { Spinner } from '@epicenter/ui/spinner';
	import PlayIcon from '@lucide/svelte/icons/play';
	import RepeatIcon from '@lucide/svelte/icons/repeat';
	import EditRecordingModal from './EditRecordingModal.svelte';
	import TransformationPicker from './TransformationPicker.svelte';
	import ViewTransformationRunsDialog from './ViewTransformationRunsDialog.svelte';
	import { nanoid } from 'nanoid/non-secure';

	const transcribeRecording = createMutation(
		rpc.transcription.transcribeRecording.options,
	);

	const deleteRecording = createMutation(rpc.db.recordings.delete.options);

	const downloadRecording = createMutation(
		rpc.download.downloadRecording.options,
	);

	let { recordingId }: { recordingId: string } = $props();

	const latestTransformationRunByRecordingIdQuery = createQuery(
		rpc.db.runs.getLatestByRecordingId(() => recordingId).options,
	);

	const recordingQuery = createQuery(
		rpc.db.recordings.getById(() => recordingId).options,
	);

	const recording = $derived(recordingQuery.data);
</script>

<div class="flex items-center gap-1">
	{#if !recording}
		<Skeleton class="size-8" />
		<Skeleton class="size-8" />
		<Skeleton class="size-8" />
		<Skeleton class="size-8" />
		<Skeleton class="size-8" />
	{:else}
		<Button
			tooltip={recording.transcriptionStatus === 'UNPROCESSED'
				? 'Start transcribing this recording'
				: recording.transcriptionStatus === 'TRANSCRIBING'
					? 'Currently transcribing...'
					: recording.transcriptionStatus === 'DONE'
						? 'Retry transcription'
						: 'Transcription failed - click to try again'}
			onclick={() => {
				const toastId = nanoid();
				rpc.notify.loading.execute({
					id: toastId,
					title: '📋 Transcribing...',
					description: 'Your recording is being transcribed...',
				});
				transcribeRecording.mutate(recording, {
					onError: (error) => {
						if (error.name === 'WhisperingError') {
							rpc.notify.error.execute({ id: toastId, ...error });
							return;
						}
						rpc.notify.error.execute({
							id: toastId,
							title: '❌ Failed to transcribe recording',
							description: 'Your recording could not be transcribed.',
							action: { type: 'more-details', error: error },
						});
					},
					onSuccess: (transcribedText) => {
						rpc.sound.playSoundIfEnabled.execute('transcriptionComplete');

						rpc.delivery.deliverTranscriptionResult.execute({
							text: transcribedText,
							toastId,
						});
					},
				});
			}}
			variant="ghost"
			size="icon"
		>
			{#if recording.transcriptionStatus === 'UNPROCESSED'}
				<PlayIcon class="size-4" />
			{:else if recording.transcriptionStatus === 'TRANSCRIBING'}
				<EllipsisIcon class="size-4" />
			{:else if recording.transcriptionStatus === 'DONE'}
				<RepeatIcon class="size-4 text-green-500" />
			{:else if recording.transcriptionStatus === 'FAILED'}
				<AlertCircleIcon class="size-4 text-red-500" />
			{/if}
		</Button>

		<TransformationPicker recordingId={recording.id} />

		<EditRecordingModal {recording} />

		<CopyToClipboardButton
			contentDescription="transcript"
			textToCopy={recording.transcribedText}
			viewTransitionName={getRecordingTransitionId({
				recordingId,
				propertyName: 'transcribedText',
			})}
		>
			<ClipboardIcon class="size-4" />
		</CopyToClipboardButton>

		{#if latestTransformationRunByRecordingIdQuery.isPending}
			<Spinner />
		{:else if latestTransformationRunByRecordingIdQuery.isError}
			<Tooltip.Provider>
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<AlertCircleIcon
								class="text-red-500"
								{...props}
								id={getRecordingTransitionId({
									recordingId,
									propertyName: 'latestTransformationRunOutput',
								})}
							/>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content class="max-w-xs text-center">
						Error fetching latest transformation run output
					</Tooltip.Content>
				</Tooltip.Root>
			</Tooltip.Provider>
		{:else}
			<CopyToClipboardButton
				contentDescription="latest transformation run output"
				textToCopy={latestTransformationRunByRecordingIdQuery.data?.status ===
				'completed'
					? latestTransformationRunByRecordingIdQuery.data.output
					: ''}
				viewTransitionName={getRecordingTransitionId({
					recordingId,
					propertyName: 'latestTransformationRunOutput',
				})}
			>
				<FileStackIcon class="size-4" />
			</CopyToClipboardButton>
		{/if}

		<ViewTransformationRunsDialog {recordingId} />

		<Button
			tooltip="Download recording"
			onclick={() =>
				downloadRecording.mutate(recording, {
					onError: (error) => {
						if (error.name === 'WhisperingError') {
							rpc.notify.error.execute(error);
							return;
						}
						rpc.notify.error.execute({
							title: 'Failed to download recording!',
							description: 'Your recording could not be downloaded.',
							action: { type: 'more-details', error },
						});
					},
					onSuccess: () => {
						rpc.notify.success.execute({
							title: 'Recording downloaded!',
							description: 'Your recording has been downloaded.',
						});
					},
				})}
			variant="ghost"
			size="icon"
		>
			{#if downloadRecording.isPending}
				<Spinner />
			{:else}
				<DownloadIcon class="size-4" />
			{/if}
		</Button>

		<Button
			tooltip="Delete recording"
			onclick={() => {
				confirmationDialog.open({
					title: 'Delete recording',
					subtitle: 'Are you sure you want to delete this recording?',
					confirmText: 'Delete',
					onConfirm: () =>
						deleteRecording.mutate(recording, {
							onSuccess: () => {
								rpc.notify.success.execute({
									title: 'Deleted recording!',
									description: 'Your recording has been deleted.',
								});
							},
							onError: (error) => {
								rpc.notify.error.execute({
									title: 'Failed to delete recording!',
									description: 'Your recording could not be deleted.',
									action: { type: 'more-details', error },
								});
							},
						}),
				});
			}}
			variant="ghost"
			size="icon"
		>
			<TrashIcon class="size-4" />
		</Button>
	{/if}
</div>
