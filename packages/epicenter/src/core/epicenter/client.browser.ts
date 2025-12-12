/**
 * Browser-specific epicenter client entry point.
 *
 * In browser environments, storageDir and epicenterDir are always undefined
 * since filesystem operations are not available.
 *
 * IMPORTANT: Browser initialization is SYNCHRONOUS because browser providers
 * (IndexedDB persistence, WebSocket sync) handle their async operations internally.
 * This enables immediate client usage without await.
 */

import type { AnyWorkspaceConfig, WorkspaceClient } from '../workspace';
import { initializeWorkspaces } from '../workspace/client.browser';
import type { EpicenterClient } from './client.shared';
import type { EpicenterConfig } from './config.browser';

export type { ActionInfo, EpicenterClient } from './client.shared';
export { iterActions } from './client.shared';

/**
 * Create an epicenter client with all workspace clients initialized
 * Uses shared initialization logic to ensure workspace instances are properly shared
 *
 * In browser environments, storageDir is always undefined (no filesystem access).
 *
 * IMPORTANT: This is SYNCHRONOUS in browser - no await needed.
 *
 * @param config - Epicenter configuration with workspaces to initialize
 * @returns Initialized epicenter client with access to all workspace exports
 *
 * @example
 * ```typescript
 * // Browser: synchronous initialization
 * const client = createEpicenterClient(epicenter);
 *
 * // Client is immediately usable
 * const pages = client.pages.getAllPages();
 * ```
 */
export function createEpicenterClient<
	const TId extends string,
	const TWorkspaces extends readonly AnyWorkspaceConfig[],
>(config: EpicenterConfig<TId, TWorkspaces>): EpicenterClient<TWorkspaces> {
	// Browser: sync initialization
	const clients = initializeWorkspaces(config.workspaces);

	const cleanup = async () => {
		await Promise.all(
			// biome-ignore lint/suspicious/noExplicitAny: WorkspacesToClients returns a mapped type that Object.values can't narrow
			Object.values(clients).map((workspaceClient: WorkspaceClient<any>) =>
				workspaceClient.destroy(),
			),
		);
	};

	return {
		...clients,
		destroy: cleanup,
		[Symbol.asyncDispose]: cleanup,
	} as EpicenterClient<TWorkspaces>;
}
