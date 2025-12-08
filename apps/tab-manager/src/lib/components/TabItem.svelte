<script lang="ts">
	import { createMutation } from '@tanstack/svelte-query';
	import { rpc } from '$lib/query';
	import XIcon from '@lucide/svelte/icons/x';
	import PinIcon from '@lucide/svelte/icons/pin';
	import PinOffIcon from '@lucide/svelte/icons/pin-off';
	import Volume2Icon from '@lucide/svelte/icons/volume-2';
	import VolumeXIcon from '@lucide/svelte/icons/volume-x';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import { Button } from '@epicenter/ui/button';
	import { Spinner } from '@epicenter/ui/spinner';
	import * as Avatar from '@epicenter/ui/avatar';
	import * as Tooltip from '@epicenter/ui/tooltip';

	let { tab }: { tab: Browser.tabs.Tab } = $props();

	const closeMutation = createMutation(rpc.tabs.close.options);
	const activateMutation = createMutation(rpc.tabs.activate.options);
	const pinMutation = createMutation(rpc.tabs.pin.options);
	const unpinMutation = createMutation(rpc.tabs.unpin.options);
	const muteMutation = createMutation(rpc.tabs.mute.options);
	const unmuteMutation = createMutation(rpc.tabs.unmute.options);
	const reloadMutation = createMutation(rpc.tabs.reload.options);
	const duplicateMutation = createMutation(rpc.tabs.duplicate.options);

	const isPinPending = $derived(
		pinMutation.isPending || unpinMutation.isPending,
	);
	const isMutePending = $derived(
		muteMutation.isPending || unmuteMutation.isPending,
	);

	// Extract domain from URL for display
	const domain = $derived.by(() => {
		if (!tab.url) return '';
		try {
			const url = new URL(tab.url);
			return url.hostname;
		} catch {
			return tab.url;
		}
	});
</script>

<button
	type="button"
	class="group flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-accent transition-colors {tab.active
		? 'bg-accent/50'
		: ''}"
	onclick={() => tab.id && activateMutation.mutate(tab.id)}
>
	<!-- Favicon -->
	<Avatar.Root class="size-4 rounded-sm flex-shrink-0">
		<Avatar.Image src={tab.favIconUrl} alt="" />
		<Avatar.Fallback class="rounded-sm">
			<GlobeIcon class="size-3 text-muted-foreground" />
		</Avatar.Fallback>
	</Avatar.Root>

	<!-- Title and URL -->
	<div class="flex-1 min-w-0">
		<div class="flex items-center gap-1">
			{#if tab.pinned}
				<PinIcon class="w-3 h-3 text-muted-foreground flex-shrink-0" />
			{/if}
			{#if tab.audible && !tab.mutedInfo?.muted}
				<Volume2Icon class="w-3 h-3 text-muted-foreground flex-shrink-0" />
			{/if}
			{#if tab.mutedInfo?.muted}
				<VolumeXIcon class="w-3 h-3 text-muted-foreground flex-shrink-0" />
			{/if}
			<span class="truncate text-sm font-medium">
				{tab.title || 'Untitled'}
			</span>
		</div>
		<div class="truncate text-xs text-muted-foreground">
			{domain}
		</div>
	</div>

	<!-- Actions (visible on hover) -->
	<div
		class="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
	>
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon"
						class="h-6 w-6"
						disabled={isPinPending}
						onclick={(e: MouseEvent) => {
							e.stopPropagation();
							if (tab.id) {
								if (tab.pinned) {
									unpinMutation.mutate(tab.id);
								} else {
									pinMutation.mutate(tab.id);
								}
							}
						}}
					>
						{#if isPinPending}
							<Spinner class="h-3 w-3" />
						{:else if tab.pinned}
							<PinOffIcon class="h-3 w-3" />
						{:else}
							<PinIcon class="h-3 w-3" />
						{/if}
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>{tab.pinned ? 'Unpin' : 'Pin'}</Tooltip.Content>
		</Tooltip.Root>

		{#if tab.audible || tab.mutedInfo?.muted}
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon"
							class="h-6 w-6"
							disabled={isMutePending}
							onclick={(e: MouseEvent) => {
								e.stopPropagation();
								if (tab.id) {
									if (tab.mutedInfo?.muted) {
										unmuteMutation.mutate(tab.id);
									} else {
										muteMutation.mutate(tab.id);
									}
								}
							}}
						>
							{#if isMutePending}
								<Spinner class="h-3 w-3" />
							{:else if tab.mutedInfo?.muted}
								<Volume2Icon class="h-3 w-3" />
							{:else}
								<VolumeXIcon class="h-3 w-3" />
							{/if}
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content
					>{tab.mutedInfo?.muted ? 'Unmute' : 'Mute'}</Tooltip.Content
				>
			</Tooltip.Root>
		{/if}

		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon"
						class="h-6 w-6"
						disabled={reloadMutation.isPending}
						onclick={(e: MouseEvent) => {
							e.stopPropagation();
							if (tab.id) {
								reloadMutation.mutate(tab.id);
							}
						}}
					>
						{#if reloadMutation.isPending}
							<Spinner class="h-3 w-3" />
						{:else}
							<RefreshCwIcon class="h-3 w-3" />
						{/if}
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>Reload</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon"
						class="h-6 w-6"
						disabled={duplicateMutation.isPending}
						onclick={(e: MouseEvent) => {
							e.stopPropagation();
							if (tab.id) {
								duplicateMutation.mutate(tab.id);
							}
						}}
					>
						{#if duplicateMutation.isPending}
							<Spinner class="h-3 w-3" />
						{:else}
							<CopyIcon class="h-3 w-3" />
						{/if}
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>Duplicate</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon"
						class="h-6 w-6 text-destructive hover:text-destructive"
						disabled={closeMutation.isPending}
						onclick={(e: MouseEvent) => {
							e.stopPropagation();
							if (tab.id) {
								closeMutation.mutate(tab.id);
							}
						}}
					>
						{#if closeMutation.isPending}
							<Spinner class="h-3 w-3" />
						{:else}
							<XIcon class="h-3 w-3" />
						{/if}
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>Close</Tooltip.Content>
		</Tooltip.Root>
	</div>
</button>
