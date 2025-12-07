import { createEpicenterClient, defineEpicenter } from '@epicenter/hq';
import { tabsWorkspace } from './tabs.workspace';

/**
 * Tab Manager Epicenter configuration
 *
 * Defines all workspaces for the tab manager extension.
 * Currently just the tabs workspace for browser tab/window operations.
 */
export const tabManagerConfig = defineEpicenter({
	id: 'tab-manager',
	workspaces: [tabsWorkspace],
});

/**
 * Tab Manager client type
 *
 * Inferred from the Epicenter config, provides typed access to all workspaces.
 */
export type TabManagerClient = Awaited<
	ReturnType<typeof createEpicenterClient<typeof tabManagerConfig>>
>;

/**
 * Module-level singleton for the client
 *
 * We use a singleton instead of Svelte context because TanStack Query
 * callbacks execute outside component lifecycle, where getContext() fails.
 */
let client: TabManagerClient | null = null;
let clientPromise: Promise<TabManagerClient> | null = null;

/**
 * Initialize the Epicenter client
 *
 * Call this once at app startup (typically in EpicenterProvider).
 * Safe to call multiple times - returns the same promise.
 */
export function initEpicenterClient(): Promise<TabManagerClient> {
	if (!clientPromise) {
		clientPromise = createEpicenterClient(tabManagerConfig).then((c) => {
			client = c;
			return c;
		});
	}
	return clientPromise;
}

/**
 * Get the Epicenter client
 *
 * Works from anywhere - components, TanStack Query callbacks, etc.
 * Throws if called before initEpicenterClient() completes.
 */
export function getEpicenterClient(): TabManagerClient {
	if (!client) {
		throw new Error(
			'Epicenter client not initialized. Wrap your app in EpicenterProvider.',
		);
	}
	return client;
}
