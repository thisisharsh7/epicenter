/**
 * Browser-specific epicenter client entry point.
 *
 * In browser environments, storageDir and epicenterDir are always undefined
 * since filesystem operations are not available.
 */

import type { AnyWorkspaceConfig, WorkspaceClient } from '../workspace';
import { initializeWorkspaces } from '../workspace/client.shared';
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
 * @param config - Epicenter configuration with workspaces to initialize
 * @returns Initialized epicenter client with access to all workspace exports
 */
export async function createEpicenterClient<
	const TId extends string,
	const TWorkspaces extends readonly AnyWorkspaceConfig[],
>(
	config: EpicenterConfig<TId, TWorkspaces>,
): Promise<EpicenterClient<TWorkspaces>> {
	// Browser: no storage directory resolution
	const clients = await initializeWorkspaces(
		config.workspaces,
		undefined, // storageDir is always undefined in browser
		undefined, // epicenterDir is always undefined in browser
	);

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
