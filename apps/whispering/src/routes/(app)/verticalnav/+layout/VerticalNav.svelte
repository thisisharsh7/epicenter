<script lang="ts">
	import * as Sidebar from '@repo/ui/sidebar';
	import {
		HomeIcon,
		ListIcon,
		LayersIcon,
		SettingsIcon,
		SunIcon,
		MoonIcon,
		LogsIcon,
		Minimize2Icon,
		MicIcon,
	} from '@lucide/svelte';
	import { GithubIcon } from '$lib/components/icons';
	import { page } from '$app/state';
	import { toggleMode } from 'mode-watcher';
	import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
	import { notificationLog } from '$lib/components/NotificationLog.svelte';
	import type { CreateQueryResult } from '@tanstack/svelte-query';
	import { useSidebar } from '@repo/ui/sidebar';
	import ManualDeviceSelector from '$lib/components/settings/selectors/ManualDeviceSelector.svelte';
	import VadDeviceSelector from '$lib/components/settings/selectors/VadDeviceSelector.svelte';
	import CompressionSelector from '$lib/components/settings/selectors/CompressionSelector.svelte';
	import TranscriptionSelector from '$lib/components/settings/selectors/TranscriptionSelector.svelte';
	import TransformationSelector from '$lib/components/settings/selectors/TransformationSelector.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import ManualRecordingButton from '$lib/components/recording/ManualRecordingButton.svelte';
	import VadRecordingButton from '$lib/components/recording/VadRecordingButton.svelte';
	import { commandCallbacks } from '$lib/commands';

	let {
		getRecorderStateQuery,
		getVadStateQuery,
	}: {
		getRecorderStateQuery: CreateQueryResult<any>;
		getVadStateQuery: CreateQueryResult<any>;
	} = $props();

	const sidebar = useSidebar();

	// Navigation items
	const navItems = [
		{ label: 'Home', href: '/verticalnav', icon: HomeIcon },
		{ label: 'Recordings', href: '/verticalnav/recordings', icon: ListIcon },
		{
			label: 'Transformations',
			href: '/verticalnav/transformations',
			icon: LayersIcon,
		},
		{ label: 'Settings', href: '/verticalnav/settings', icon: SettingsIcon },
	] as const;

	// Footer items - only essential items (minimize on desktop, notification history)
	const footerItems = [
		...(window.__TAURI_INTERNALS__
			? [
					{
						label: 'Minimize',
						icon: Minimize2Icon,
						action: () => getCurrentWindow().setSize(new LogicalSize(72, 84)),
					},
				]
			: []),
		{
			label: 'Notification History',
			icon: LogsIcon,
			action: () => {
				notificationLog.isOpen = true;
			},
		},
	];

	// Check if route is active
	const isActive = (href: string) => {
		return page.url.pathname === href;
	};
</script>

<Sidebar.Root collapsible="icon" side="left" variant="sidebar">
	<Sidebar.Rail />
	<Sidebar.Header>
		<div class="flex items-center justify-between gap-2">
			<button
				onclick={sidebar.toggle}
				class="flex items-center gap-2 p-2 hover:bg-sidebar-accent rounded-md transition-colors w-full"
				title="Toggle sidebar"
			>
				<span
					class="flex items-center justify-center size-4 text-base leading-none"
					>🎙️</span
				>
				<span class="font-bold text-base group-data-[collapsible=icon]:hidden">
					Whispering
				</span>
			</button>
			<Sidebar.Trigger class="group-data-[collapsible=icon]:hidden" />
		</div>
	</Sidebar.Header>

	<Sidebar.Content>
		<!-- Main Navigation Group -->
		<Sidebar.Group class="p-1 pb-0">
			<Sidebar.GroupLabel>Navigation</Sidebar.GroupLabel>
			<Sidebar.GroupContent>
				<Sidebar.Menu class="gap-0.5">
					{#each navItems as item}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton isActive={isActive(item.href)}>
								{#snippet child({ props })}
									<a href={item.href} {...props} title={item.label}>
										<svelte:component this={item.icon} />
										<span>{item.label}</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>

		<!-- Quick Settings Group -->
		<Sidebar.Group class="p-1 pb-0">
			<Sidebar.GroupLabel>Quick Settings</Sidebar.GroupLabel>
			<Sidebar.GroupContent>
				<Sidebar.Menu class="gap-0.5">
					<!-- Device Selector (mode-aware) -->
					<Sidebar.MenuItem>
						{#if settings.value['recording.mode'] === 'manual'}
							<ManualDeviceSelector showLabel unstyled />
						{:else if settings.value['recording.mode'] === 'vad'}
							<VadDeviceSelector showLabel unstyled />
						{:else}
							<Sidebar.MenuButton disabled>
								{#snippet child({ props })}
									<button
										{...props}
										disabled
										title="Device selector (not available in upload mode)"
									>
										<MicIcon />
										<span class="text-muted-foreground">Device Selector</span>
									</button>
								{/snippet}
							</Sidebar.MenuButton>
						{/if}
					</Sidebar.MenuItem>

					<!-- Compression Selector -->
					<Sidebar.MenuItem>
						<CompressionSelector showLabel unstyled />
					</Sidebar.MenuItem>

					<!-- Transcription Provider Selector -->
					<Sidebar.MenuItem>
						<TranscriptionSelector showLabel unstyled />
					</Sidebar.MenuItem>

					<!-- Transformation Provider Selector -->
					<Sidebar.MenuItem>
						<TransformationSelector showLabel unstyled />
					</Sidebar.MenuItem>
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>

		<!-- Quick Transcription Group -->
		<Sidebar.Group class="p-1 pb-0">
			<Sidebar.GroupLabel>Quick Transcription</Sidebar.GroupLabel>
			<Sidebar.GroupContent>
				<Sidebar.Menu class="gap-0.5">
					<!-- VAD Recording Button (toggles start/stop) -->
					<Sidebar.MenuItem>
						<VadRecordingButton {getVadStateQuery} unstyled showLabel />
					</Sidebar.MenuItem>

					<!-- Manual Recording Button (toggles start/stop) -->
					<Sidebar.MenuItem>
						<ManualRecordingButton {getRecorderStateQuery} unstyled showLabel />
					</Sidebar.MenuItem>

					<!-- Cancel Manual Recording (fixed position - no layout shift) -->
					<Sidebar.MenuItem>
						<button
							type="button"
							onclick={commandCallbacks.cancelManualRecording}
							class="peer/menu-button outline-hidden ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm transition-[width,height,padding,opacity] focus-visible:ring-2 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 {getRecorderStateQuery.data !==
							'RECORDING'
								? 'opacity-0 pointer-events-none'
								: ''}"
							title="Cancel recording"
							disabled={getRecorderStateQuery.data !== 'RECORDING'}
						>
							<div class="relative shrink-0">
								<span class="text-base flex items-center justify-center size-4"
									>🚫</span
								>
							</div>
							<span>Cancel recording</span>
						</button>
					</Sidebar.MenuItem>
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>

		<!-- Additional Actions (scrollable, not sticky) -->
		<Sidebar.Group class="p-1 pb-0">
			<Sidebar.GroupContent>
				<Sidebar.Menu class="gap-0.5">
					<!-- Toggle dark mode -->
					<Sidebar.MenuItem>
						<Sidebar.MenuButton>
							{#snippet child({ props })}
								<button
									onclick={toggleMode}
									{...props}
									title="Toggle dark mode"
								>
									<SunIcon
										class="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
									/>
									<MoonIcon
										class="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
									/>
									<span>Toggle dark mode</span>
								</button>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>

					<!-- View project on GitHub -->
					<Sidebar.MenuItem>
						<Sidebar.MenuButton>
							{#snippet child({ props })}
								<a
									href="https://github.com/epicenter-md/epicenter"
									target="_blank"
									rel="noopener noreferrer"
									{...props}
									title="View project on GitHub"
								>
									<svelte:component this={GithubIcon} />
									<span>View project on GitHub</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>

	<Sidebar.Footer>
		<Sidebar.Menu class="gap-0.5">
			{#each footerItems as item}
				<Sidebar.MenuItem>
					{#if 'href' in item}
						<Sidebar.MenuButton>
							{#snippet child({ props })}
								<a
									href={item.href}
									target={item.external ? '_blank' : undefined}
									rel={item.external ? 'noopener noreferrer' : undefined}
									{...props}
									title={item.label}
								>
									<svelte:component this={item.icon} />
									<span>{item.label}</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					{:else if 'action' in item}
						<!-- Remove tooltip to fix click issue -->
						<Sidebar.MenuButton>
							{#snippet child({ props })}
								<button onclick={item.action} {...props} title={item.label}>
									{#if item.isTheme}
										<!-- Theme toggle with animated icons -->
										<SunIcon
											class="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
										/>
										<MoonIcon
											class="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
										/>
									{:else}
										<svelte:component this={item.icon} />
									{/if}
									<span>{item.label}</span>
								</button>
							{/snippet}
						</Sidebar.MenuButton>
					{/if}
				</Sidebar.MenuItem>
			{/each}
		</Sidebar.Menu>
	</Sidebar.Footer>
</Sidebar.Root>
