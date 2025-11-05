import type { Action, WorkspaceActionMap } from '../actions';
import type { AnyWorkspaceConfig, WorkspaceClient } from '../workspace';
import {
	type WorkspacesToClients,
	initializeWorkspaces,
} from '../workspace/client';
import type { EpicenterConfig } from './config';

/**
 * Epicenter client type
 * Maps workspace ids to their action handlers
 * Provides typed access to all workspace actions
 */
export type EpicenterClient<TWorkspaces extends readonly AnyWorkspaceConfig[]> =
	WorkspacesToClients<TWorkspaces> & {
		/**
		 * Cleanup method for resource management
		 * Destroys all workspaces in this epicenter
		 *
		 * Use with `using` syntax for automatic cleanup:
		 * ```typescript
		 * using client = await createEpicenterClient(config);
		 * ```
		 *
		 * Or call manually for explicit control:
		 * ```typescript
		 * const client = await createEpicenterClient(config);
		 * // ... use client ...
		 * client[Symbol.dispose]();
		 * ```
		 */
		[Symbol.dispose]: () => void;
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
 * // Scoped usage with automatic cleanup (scripts, tests, CLI commands)
 * {
 *   using client = await createEpicenterClient(epicenter);
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
 * process.on('SIGTERM', () => {
 *   client[Symbol.dispose]();
 * });
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
			workspace[Symbol.dispose]();
		}
	};

	return {
		...clients,
		[Symbol.dispose]: cleanup,
	} as EpicenterClient<TWorkspaces>;
}

/**
 * Group actions by workspace from an Epicenter client.
 *
 * Returns a Map structure that groups actions by workspace ID, making it easy to
 * iterate over workspaces and their actions in a nested manner. This is useful when
 * you need to process actions grouped by workspace rather than in a flat iteration.
 *
 * @param client - The Epicenter client with workspace namespaces
 * @returns Map where:
 *   - First key (string) is the workspace ID
 *   - Second key (string) is the action name
 *   - Value is the Action object
 *
 * @example
 * ```typescript
 * // Register yargs CLI commands grouped by workspace
 * const grouped = groupActionsByWorkspace(client);
 * for (const [workspaceId, actions] of grouped) {
 *   cli.command(workspaceId, description, (yargs) => {
 *     for (const [actionName, action] of actions) {
 *       yargs.command(actionName, ...);
 *     }
 *   });
 * }
 * ```
 */
export function groupActionsByWorkspace<
	TWorkspaces extends readonly AnyWorkspaceConfig[],
>(client: EpicenterClient<TWorkspaces>): Map<string, Map<string, Action>> {
	const grouped = new Map<string, Map<string, Action>>();

	// Extract workspace clients (excluding Symbol.dispose from the client interface)
	const { [Symbol.dispose]: _dispose, ...workspaceClients } = client;

	// Group actions by workspace
	for (const [workspaceId, workspaceClient] of Object.entries(
		workspaceClients,
	)) {
		// Extract actions (excluding Symbol.dispose from the workspace interface)
		const { [Symbol.dispose]: _workspaceDispose, ...workspaceActions } =
			workspaceClient as WorkspaceClient<WorkspaceActionMap>;

		const actionMap = new Map<string, Action>();
		for (const [actionName, action] of Object.entries(workspaceActions)) {
			actionMap.set(actionName, action);
		}

		grouped.set(workspaceId, actionMap);
	}

	return grouped;
}

/**
 * Iterate over all workspace actions in an Epicenter client.
 *
 * Epicenter has a three-layer hierarchy: Client → Workspaces → Actions.
 * This utility traverses all layers and invokes the callback for each action.
 * The Symbol.dispose methods at client and workspace levels are automatically excluded.
 *
 * For grouped iteration (e.g., when you need to process actions by workspace),
 * use `groupActionsByWorkspace` instead.
 *
 * @param client - The Epicenter client with workspace namespaces
 * @param callback - Function invoked for each action. Receives an object with:
 *   - workspaceId (string): The workspace ID
 *   - actionName (string): The action name
 *   - action (Action): The action object
 *
 * @example
 * ```typescript
 * // Register MCP tools (flat iteration)
 * forEachAction(client, ({ workspaceId, actionName, action }) => {
 *   actions.set(`${workspaceId}_${actionName}`, action);
 * });
 *
 * // Register REST routes (flat iteration)
 * forEachAction(client, ({ workspaceId, actionName, action }) => {
 *   app.get(`/${workspaceId}/${actionName}`, handler);
 * });
 * ```
 *
 * @see {@link groupActionsByWorkspace} for grouped iteration
 */
export function forEachAction<
	TWorkspaces extends readonly AnyWorkspaceConfig[],
>(
	client: EpicenterClient<TWorkspaces>,
	callback: (params: {
		workspaceId: string;
		actionName: string;
		action: Action;
	}) => void,
): void {
	// Use groupActionsByWorkspace internally to avoid duplication
	const grouped = groupActionsByWorkspace(client);

	for (const [workspaceId, actions] of grouped) {
		for (const [actionName, action] of actions) {
			callback({ workspaceId, actionName, action });
		}
	}
}
