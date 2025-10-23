import type { Action, WorkspaceActionMap } from '../actions';
import type { AnyWorkspaceConfig, WorkspaceClient } from '../workspace';
import { initializeWorkspaces, type WorkspacesToClients } from '../workspace/client';
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
		for (const workspace of Object.values(clients)) {
			workspace.destroy();
		}
	};

	return {
		...clients,
		destroy: cleanup,
	} as EpicenterClient<TWorkspaces>;
}

/**
 * Iterate over all workspace actions in an Epicenter client.
 *
 * Epicenter has a three-layer hierarchy: Client → Workspaces → Actions.
 * This utility traverses all layers and invokes the callback for each action.
 * The `destroy` methods at client and workspace levels are automatically excluded.
 *
 * @param client - The Epicenter client with workspace namespaces
 * @param callback - Function invoked for each action with `{ workspaceName, actionName, action }`
 *
 * @example
 * ```typescript
 * // Register MCP tools
 * forEachAction(client, ({ workspaceName, actionName, action }) => {
 *   actions.set(`${workspaceName}_${actionName}`, action);
 * });
 *
 * // Register REST routes
 * forEachAction(client, ({ workspaceName, actionName, action }) => {
 *   app.get(`/${workspaceName}/${actionName}`, handler);
 * });
 * ```
 */
export function forEachAction<TWorkspaces extends readonly AnyWorkspaceConfig[]>(
	client: EpicenterClient<TWorkspaces>,
	callback: (params: {
		workspaceName: TWorkspaces[number]['name'];
		actionName: string;
		action: Action;
	}) => void,
): void {
	// Extract workspace clients (excluding the destroy method from the client interface)
	const { destroy, ...workspaceClients } = client;

	// Iterate over each workspace and its actions
	for (const [workspaceName, workspaceClient] of Object.entries(workspaceClients)) {
		// Extract actions (excluding the destroy method from the workspace interface)
		const { destroy, ...workspaceActions } = workspaceClient as WorkspaceClient<WorkspaceActionMap>;

		// Invoke callback for each action
		for (const [actionName, action] of Object.entries(workspaceActions)) {
			callback({ workspaceName, actionName, action });
		}
	}
}
