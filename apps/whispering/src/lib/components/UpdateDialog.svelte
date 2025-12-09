<script module lang="ts">
	import type { Update } from '@tauri-apps/plugin-updater';

	export const updateDialog = createUpdateDialog();
	export type UpdateInfo = Pick<
		Update,
		'version' | 'date' | 'body' | 'downloadAndInstall'
	> | null;

	function createUpdateDialog() {
		let isOpen = $state(false);
		let update = $state<UpdateInfo | null>(null);
		let downloadProgress = $state(0);
		let downloadTotal = $state(0);
		let error = $state<string | null>(null);

		return {
			get isOpen() {
				return isOpen;
			},
			set isOpen(v) {
				isOpen = v;
			},
			get update() {
				return update;
			},
			get isDownloading() {
				return downloadTotal > 0 && downloadProgress < downloadTotal && !error;
			},
			get isDownloadComplete() {
				return downloadTotal > 0 && downloadProgress >= downloadTotal && !error;
			},
			get progressPercentage() {
				return downloadTotal > 0 ? (downloadProgress / downloadTotal) * 100 : 0;
			},
			get error() {
				return error;
			},
			open(newUpdate: UpdateInfo) {
				update = newUpdate;
				isOpen = true;
				downloadProgress = 0;
				downloadTotal = 0;
				error = null;
			},
			close() {
				isOpen = false;
			},
			updateProgress(progress: number, total: number) {
				downloadProgress = progress;
				downloadTotal = total;
			},
			setError(err: string | null) {
				error = err;
				downloadTotal = 0;
			},
		};
	}
</script>

<script lang="ts">
	import * as Dialog from '@epicenter/ui/dialog';
	import { Button } from '@epicenter/ui/button';
	import { Progress } from '@epicenter/ui/progress';
	import { ScrollArea } from '@epicenter/ui/scroll-area';
	import { Separator } from '@epicenter/ui/separator';
	import { relaunch } from '@tauri-apps/plugin-process';
	import { rpc } from '$lib/query';
	import * as Alert from '@epicenter/ui/alert';
	import AlertTriangleIcon from '@lucide/svelte/icons/alert-triangle';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import CheckCircleIcon from '@lucide/svelte/icons/check-circle';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import { extractErrorMessage } from 'wellcrafted/error';

	const GITHUB_RELEASES_URL =
		'https://github.com/EpicenterHQ/epicenter/releases/tag';

	function getGitHubReleaseUrl(version: string) {
		const tag = version.startsWith('v') ? version : `v${version}`;
		return `${GITHUB_RELEASES_URL}/${tag}`;
	}

	async function handleDownloadAndInstall() {
		if (!updateDialog.update) return;

		updateDialog.setError(null);

		try {
			let downloaded = 0;
			let contentLength = 0;

			await updateDialog.update.downloadAndInstall((event) => {
				switch (event.event) {
					case 'Started':
						contentLength = event.data.contentLength ?? 0;
						updateDialog.updateProgress(0, contentLength);
						break;
					case 'Progress':
						downloaded += event.data.chunkLength;
						updateDialog.updateProgress(downloaded, contentLength);
						break;
					case 'Finished':
						rpc.notify.success.execute({
							title: 'Update installed successfully!',
							description: 'Restart Whispering to apply the update.',
							action: {
								type: 'button',
								label: 'Restart Whispering',
								onClick: () => relaunch(),
							},
						});
						break;
				}
			});
		} catch (err) {
			updateDialog.setError(extractErrorMessage(err));
			rpc.notify.error.execute({
				title: 'Failed to install update',
				description: extractErrorMessage(err),
			});
		}
	}
</script>

<Dialog.Root bind:open={updateDialog.isOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Update Available</Dialog.Title>
			<Dialog.Description>
				Version {updateDialog.update?.version} is ready to install
				{#if updateDialog.update?.date}
					<span class="text-muted-foreground">
						&middot; {new Date(updateDialog.update.date).toLocaleDateString()}
					</span>
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		{#if updateDialog.update?.body}
			<ScrollArea class="max-h-[200px]">
				<p class="text-sm text-muted-foreground whitespace-pre-line pr-4">
					{updateDialog.update.body}
				</p>
			</ScrollArea>
			<Separator />
		{/if}

		{#if updateDialog.isDownloading || updateDialog.isDownloadComplete}
			<div class="space-y-2">
				<div class="flex items-center justify-between text-sm">
					{#if updateDialog.isDownloadComplete}
						<span
							class="flex items-center gap-2 text-green-600 dark:text-green-400"
						>
							<CheckCircleIcon />
							Download complete
						</span>
					{:else}
						<span class="flex items-center gap-2 text-muted-foreground">
							<DownloadIcon class="animate-pulse" />
							Downloading...
						</span>
					{/if}
					<span class="text-muted-foreground tabular-nums">
						{Math.round(updateDialog.progressPercentage)}%
					</span>
				</div>
				<Progress value={updateDialog.progressPercentage} max={100} />
			</div>
		{/if}

		{#if updateDialog.error}
			<Alert.Root variant="destructive">
				<AlertTriangleIcon />
				<Alert.Title>Installation failed</Alert.Title>
				<Alert.Description>
					{updateDialog.error}
				</Alert.Description>
			</Alert.Root>
		{/if}

		<Dialog.Footer class="justify-between">
			{#if updateDialog.update?.version}
				<Button
					variant="ghost"
					href={getGitHubReleaseUrl(updateDialog.update.version)}
					target="_blank"
					rel="noopener noreferrer"
				>
					View full release notes
					<ExternalLinkIcon />
				</Button>
			{/if}
			<div class="flex gap-2">
				<Button
					variant="outline"
					onclick={() => updateDialog.close()}
					disabled={updateDialog.isDownloading}
				>
					Later
				</Button>
				{#if updateDialog.isDownloadComplete}
					<Button onclick={() => relaunch()}>Restart Now</Button>
				{:else}
					<Button
						onclick={handleDownloadAndInstall}
						disabled={updateDialog.isDownloading}
					>
						{#if updateDialog.isDownloading}
							Downloading...
						{:else}
							<DownloadIcon />
							Install Update
						{/if}
					</Button>
				{/if}
			</div>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
