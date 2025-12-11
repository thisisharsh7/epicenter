/**
 * Node.js-specific epicenter client entry point.
 *
 * In Node.js environments, storageDir is resolved to an absolute path
 * using node:path. This enables filesystem-based persistence and indexes.
 */

import path from 'node:path';
import type { EpicenterDir, StorageDir } from '../types';
import type { AnyWorkspaceConfig, WorkspaceClient } from '../workspace';
import { initializeWorkspaces } from '../workspace/client.shared';
import type { EpicenterClient } from './client.shared';
import type { EpicenterConfig } from './config.node';

export type { ActionInfo, EpicenterClient } from './client.shared';
export { iterActions } from './client.shared';

/**
 * Create an epicenter client with all workspace clients initialized
 * Uses shared initialization logic to ensure workspace instances are properly shared
 *
 * In Node.js environments, storageDir is resolved to an absolute path.
 *
 * @param config - Epicenter configuration with workspaces to initialize
 * @returns Initialized epicenter client with access to all workspace exports
 *
 * @example
 * ```typescript
 * // Scoped usage with automatic cleanup (scripts, tests, CLI commands)
 * {
 *   await using client = await createEpicenterClient(epicenter);
 *
 *   // Access workspace actions by workspace id
 *   const page = await client.pages.createPage({
 *     title: 'My First Post',
 *     content: 'Hello, world!',
 *     type: 'blog',
 *     tags: 'tech',
 *   });
 *
 *   await client.contentHub.createYouTubePost({
 *     pageId: page.id,
 *     title: 'Check out my blog post!',
 *     description: 'A great post about...',
 *     niche: ['Coding', 'Productivity'],
 *   });
 *   // Automatic cleanup when scope exits
 * }
 *
 * // Long-lived usage (servers, desktop apps) with manual cleanup
 * const client = await createEpicenterClient(epicenter);
 * // ... use client for app lifetime ...
 * process.on('SIGTERM', async () => {
 *   await client.destroy();
 * });
 * ```
 */
export async function createEpicenterClient<
	const TId extends string,
	const TWorkspaces extends readonly AnyWorkspaceConfig[],
>(
	config: EpicenterConfig<TId, TWorkspaces>,
): Promise<EpicenterClient<TWorkspaces>> {
	// Node.js: resolve storage directory and epicenter directory
	const storageDir = path.resolve(
		config.storageDir ?? process.cwd(),
	) as StorageDir;
	const epicenterDir = path.join(storageDir, '.epicenter') as EpicenterDir;

	// Initialize workspaces using flat/hoisted resolution model
	// All transitive dependencies must be explicitly listed in config.workspaces
	// initializeWorkspaces will validate this and throw if dependencies are missing
	const clients = await initializeWorkspaces(
		config.workspaces,
		storageDir,
		epicenterDir,
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
