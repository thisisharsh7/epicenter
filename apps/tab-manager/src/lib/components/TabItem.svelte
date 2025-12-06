<script lang="ts">
	import { createMutation } from '@tanstack/svelte-query';
	import { rpc } from '$lib/query';
	import type { Tab } from '$lib/query/tabs';
	import XIcon from '@lucide/svelte/icons/x';
	import PinIcon from '@lucide/svelte/icons/pin';
	import PinOffIcon from '@lucide/svelte/icons/pin-off';
	import Volume2Icon from '@lucide/svelte/icons/volume-2';
	import VolumeXIcon from '@lucide/svelte/icons/volume-x';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import { Button } from '@epicenter/ui/button';

	let { tab }: { tab: Tab } = $props();

	const closeMutation = createMutation(rpc.tabs.close.options);
	const activateMutation = createMutation(rpc.tabs.activate.options);
	const pinMutation = createMutation(rpc.tabs.pin.options);
	const unpinMutation = createMutation(rpc.tabs.unpin.options);
	const muteMutation = createMutation(rpc.tabs.mute.options);
	const unmuteMutation = createMutation(rpc.tabs.unmute.options);
	const reloadMutation = createMutation(rpc.tabs.reload.options);
	const duplicateMutation = createMutation(rpc.tabs.duplicate.options);

	function handleActivate() {
		activateMutation.mutate(tab.id);
	}

	function handleClose(e: MouseEvent) {
		e.stopPropagation();
		closeMutation.mutate(tab.id);
	}

	function handleTogglePin(e: MouseEvent) {
		e.stopPropagation();
		if (tab.pinned) {
			unpinMutation.mutate(tab.id);
		} else {
			pinMutation.mutate(tab.id);
		}
	}

	function handleToggleMute(e: MouseEvent) {
		e.stopPropagation();
		if (tab.mutedInfo?.muted) {
			unmuteMutation.mutate(tab.id);
		} else {
			muteMutation.mutate(tab.id);
		}
	}

	function handleReload(e: MouseEvent) {
		e.stopPropagation();
		reloadMutation.mutate(tab.id);
	}

	function handleDuplicate(e: MouseEvent) {
		e.stopPropagation();
		duplicateMutation.mutate(tab.id);
	}

	// Extract domain from URL for display
	const domain = $derived.by(() => {
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
	onclick={handleActivate}
>
	<!-- Favicon -->
	<div class="flex-shrink-0 w-4 h-4">
		{#if tab.favIconUrl}
			<img
				src={tab.favIconUrl}
				alt=""
				class="w-4 h-4 rounded-sm"
				onerror={(e) => {
					(e.target as HTMLImageElement).style.display = 'none';
				}}
			/>
		{:else}
			<div class="w-4 h-4 rounded-sm bg-muted"></div>
		{/if}
	</div>

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
	<div class="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
		<Button
			variant="ghost"
			size="icon"
			class="h-6 w-6"
			onclick={handleTogglePin}
			title={tab.pinned ? 'Unpin' : 'Pin'}
		>
			{#if tab.pinned}
				<PinOffIcon class="h-3 w-3" />
			{:else}
				<PinIcon class="h-3 w-3" />
			{/if}
		</Button>

		{#if tab.audible || tab.mutedInfo?.muted}
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6"
				onclick={handleToggleMute}
				title={tab.mutedInfo?.muted ? 'Unmute' : 'Mute'}
			>
				{#if tab.mutedInfo?.muted}
					<Volume2Icon class="h-3 w-3" />
				{:else}
					<VolumeXIcon class="h-3 w-3" />
				{/if}
			</Button>
		{/if}

		<Button
			variant="ghost"
			size="icon"
			class="h-6 w-6"
			onclick={handleReload}
			title="Reload"
		>
			<RefreshCwIcon class="h-3 w-3" />
		</Button>

		<Button
			variant="ghost"
			size="icon"
			class="h-6 w-6"
			onclick={handleDuplicate}
			title="Duplicate"
		>
			<CopyIcon class="h-3 w-3" />
		</Button>

		<Button
			variant="ghost"
			size="icon"
			class="h-6 w-6 text-destructive hover:text-destructive"
			onclick={handleClose}
			title="Close"
		>
			<XIcon class="h-3 w-3" />
		</Button>
	</div>
</button>
