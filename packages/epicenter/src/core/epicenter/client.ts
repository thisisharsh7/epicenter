import type { AnyWorkspaceConfig } from '../workspace';
import { initializeWorkspaces } from '../workspace/client';
import type { WorkspacesToClients } from '../workspace/client';
import type { EpicenterConfig } from './config';

/**
 * Epicenter client type
 * Maps workspace names to their action handlers
 * Provides typed access to all workspace actions
 */
export type EpicenterClient<TWorkspaces extends readonly AnyWorkspaceConfig[]> =
	WorkspacesToClients<TWorkspaces> & {
		/**
		 * Cleanup method for resource management
		 * Destroys all workspaces in this epicenter
		 */
		destroy: () => void;
	};

/**
 * Create an epicenter client with all workspace clients initialized
 * Uses shared initialization logic to ensure workspace instances are properly shared
 *
 * @param config - Epicenter configuration with workspaces to initialize
 * @returns Initialized epicenter client with access to all workspace actions
 *
 * @example
 * ```typescript
 * // Long-lived usage (web app, desktop app)
 * const client = await createEpicenterClient(epicenter);
 *
 * // Access workspace actions by workspace name
 * const page = await client.pages.createPage({
 *   title: 'My First Post',
 *   content: 'Hello, world!',
 *   type: 'blog',
 *   tags: 'tech',
 * });
 *
 * await client.contentHub.createYouTubePost({
 *   pageId: page.id,
 *   title: 'Check out my blog post!',
 *   description: 'A great post about...',
 *   niche: ['Coding', 'Productivity'],
 * });
 *
 * // Explicit cleanup when done
 * client.destroy();
 * ```
 */
export async function createEpicenterClient<
	const TId extends string,
	const TWorkspaces extends readonly AnyWorkspaceConfig[],
>(
	config: EpicenterConfig<TId, TWorkspaces>,
): Promise<EpicenterClient<TWorkspaces>> {
	// Initialize workspaces using flat/hoisted resolution model
	// All transitive dependencies must be explicitly listed in config.workspaces
	// initializeWorkspaces will validate this and throw if dependencies are missing
	const clients = await initializeWorkspaces(config.workspaces);

	const cleanup = () => {
		for (const client of Object.values(clients) as Array<{ destroy: () => void }>) {
			client.destroy();
		}
	};

	return {
		...clients,
		destroy: cleanup,
	} as EpicenterClient<TWorkspaces>;
}
