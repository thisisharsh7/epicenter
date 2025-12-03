<script lang="ts">
	import * as Sidebar from '@repo/ui/sidebar';
	import HomeIcon from '@lucide/svelte/icons/house';
	import ListIcon from '@lucide/svelte/icons/list';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import LogsIcon from '@lucide/svelte/icons/scroll-text';
	import Minimize2Icon from '@lucide/svelte/icons/minimize-2';
	import { GithubIcon } from '$lib/components/icons';
	import { page } from '$app/state';
	import { toggleMode } from 'mode-watcher';
	import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
	import { notificationLog } from '$lib/components/NotificationLog.svelte';
	import { useSidebar } from '@repo/ui/sidebar';
	import CompressionSelector from '$lib/components/settings/selectors/CompressionSelector.svelte';
	import TranscriptionSelector from '$lib/components/settings/selectors/TranscriptionSelector.svelte';
	import TransformationSelector from '$lib/components/settings/selectors/TransformationSelector.svelte';

	const sidebar = useSidebar();

	// Navigation items
	const navItems = [
		{ label: 'Home', href: '/', icon: HomeIcon, exact: true },
		{ label: 'Recordings', href: '/recordings', icon: ListIcon },
		{ label: 'Transformations', href: '/transformations', icon: LayersIcon },
		{ label: 'Settings', href: '/settings', icon: SettingsIcon },
	] as const;

	// Check if route is active - uses safer matching that prevents /recordings from matching /recordingsXYZ
	const isActive = (href: string, exact = false) => {
		const pathname = page.url.pathname;
		if (exact) return pathname === href;
		return pathname === href || pathname.startsWith(`${href}/`);
	};
</script>

<Sidebar.Root collapsible="icon">
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton
					size="lg"
					class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
				>
					{#snippet child({ props })}
						<button {...props} onclick={sidebar.toggle}>
							<div
								class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
							>
								<span class="text-lg">🎙️</span>
							</div>
							<div class="grid flex-1 text-left text-sm leading-tight">
								<span class="truncate font-semibold">Whispering</span>
								<span class="truncate text-xs text-muted-foreground"
									>Speech to text</span
								>
							</div>
						</button>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content>
		<!-- Navigation Group -->
		<Sidebar.Group>
			<Sidebar.GroupLabel>Navigation</Sidebar.GroupLabel>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					{#each navItems as item}
						{@const active = isActive(item.href, item.exact ?? false)}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton isActive={active}>
								{#snippet child({ props })}
									<a
										href={item.href}
										{...props}
										onclick={() => {
											if (sidebar.isMobile) {
												sidebar.setOpenMobile(false);
											}
										}}
									>
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
		<Sidebar.Group>
			<Sidebar.GroupLabel>Quick Settings</Sidebar.GroupLabel>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						<CompressionSelector />
					</Sidebar.MenuItem>
					<Sidebar.MenuItem>
						<TranscriptionSelector />
					</Sidebar.MenuItem>
					<Sidebar.MenuItem>
						<TransformationSelector />
					</Sidebar.MenuItem>
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>

	<Sidebar.Footer>
		<Sidebar.Menu>
			<!-- Toggle dark mode -->
			<Sidebar.MenuItem>
				<Sidebar.MenuButton>
					{#snippet child({ props })}
						<button onclick={toggleMode} {...props}>
							<SunIcon
								class="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
							/>
							<MoonIcon
								class="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
							/>
							<span>Toggle theme</span>
						</button>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>

			<!-- GitHub link -->
			<Sidebar.MenuItem>
				<Sidebar.MenuButton>
					{#snippet child({ props })}
						<a
							href="https://github.com/EpicenterHQ/epicenter"
							target="_blank"
							rel="noopener noreferrer"
							{...props}
						>
							<GithubIcon />
							<span>GitHub</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>

			<!-- Notification History -->
			<Sidebar.MenuItem>
				<Sidebar.MenuButton>
					{#snippet child({ props })}
						<button onclick={() => (notificationLog.isOpen = true)} {...props}>
							<LogsIcon />
							<span>Notifications</span>
						</button>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>

			<!-- Minimize (desktop only) -->
			{#if window.__TAURI_INTERNALS__}
				<Sidebar.MenuItem>
					<Sidebar.MenuButton>
						{#snippet child({ props })}
							<button
								onclick={() =>
									getCurrentWindow().setSize(new LogicalSize(72, 84))}
								{...props}
							>
								<Minimize2Icon />
								<span>Minimize</span>
							</button>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			{/if}
		</Sidebar.Menu>
	</Sidebar.Footer>

	<Sidebar.Rail />
</Sidebar.Root>
